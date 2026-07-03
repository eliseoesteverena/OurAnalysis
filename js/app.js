/**
 * app.js — router + orquestación de las 3 vistas. Sin frameworks.
 */
(function () {
  // ---------------- Drawer ----------------
  const menuBtn = document.getElementById("menuBtn");
  const drawer = document.getElementById("drawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const drawerLinks = Array.from(document.querySelectorAll(".drawer-link"));

  function openDrawer() {
    drawer.classList.add("open");
    drawerOverlay.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawerOverlay.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", () => {
    drawer.classList.contains("open") ? closeDrawer() : openDrawer();
  });
  drawerOverlay.addEventListener("click", closeDrawer);
  drawerLinks.forEach(link => link.addEventListener("click", closeDrawer));

  // ---------------- Router ----------------
  const views = {
    "/": document.getElementById("view-home"),
    "/historial": document.getElementById("view-historial"),
    "/config": document.getElementById("view-config"),
  };

  function currentRoute() {
    const hash = location.hash.replace(/^#/, "") || "/";
    return views[hash] ? hash : "/";
  }

  function render(route) {
    Object.entries(views).forEach(([r, el]) => { el.hidden = r !== route; });
    drawerLinks.forEach(link => {
      link.classList.toggle("active", link.dataset.route === route);
    });
    if (route === "/historial") renderHistorial();
  }

  window.addEventListener("hashchange", () => render(currentRoute()));

  // ---------------- Settings / idioma ----------------
  function ensureLanguage() {
    const settings = OA.getSettings();
    if (!settings.language) {
      const browserLang = (navigator.language || "es").split("-")[0];
      OA.saveSettings({ language: browserLang });
      return browserLang;
    }
    return settings.language;
  }

  const langSel = document.getElementById("langSel");
  function initConfigView() {
    const lang = ensureLanguage();
    if ([...langSel.options].some(o => o.value === lang)) {
      langSel.value = lang;
    }
  }
  langSel.addEventListener("change", () => {
    OA.saveSettings({ language: langSel.value });
  });

  document.getElementById("clearDataBtn").addEventListener("click", () => {
    if (confirm("¿Borrar todas las entradas guardadas en este dispositivo? Esta acción no se puede deshacer.")) {
      OA.clearAll();
      lastEntry = null;
      document.getElementById("lastEntryPanel").hidden = true;
      renderHistorial();
      alert("Datos borrados.");
    }
  });

  // ---------------- Home: grabación ----------------
  const recordBtn = document.getElementById("recordBtn");
  const timerEl = document.getElementById("timer");
  const hintEl = document.getElementById("hint");
  const meterEl = document.getElementById("meter");
  const statusBox = document.getElementById("statusBox");

  const lastEntryPanel = document.getElementById("lastEntryPanel");
  const lastEntryMeta = document.getElementById("lastEntryMeta");
  const lastEntryContent = document.getElementById("lastEntryContent");
  const lastEntryEdit = document.getElementById("lastEntryEdit");
  const editLastBtn = document.getElementById("editLastBtn");
  const saveEditBtn = document.getElementById("saveEditBtn");
  const discardLastBtn = document.getElementById("discardLastBtn");

  let lastEntry = null;

  const BAR_COUNT = 24;
  for (let i = 0; i < BAR_COUNT; i++) {
    const b = document.createElement("div");
    b.className = "bar";
    meterEl.appendChild(b);
  }
  const bars = Array.from(meterEl.querySelectorAll(".bar"));

  function setStatus(msg, type) {
    if (!msg) { statusBox.className = "status"; statusBox.textContent = ""; return; }
    statusBox.className = "status show " + (type || "info");
    statusBox.textContent = msg;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return m + ":" + s;
  }

  function resetMeter() {
    bars.forEach(b => { b.style.height = "4px"; b.style.background = "var(--hairline)"; });
  }

  function updateMeterFromLevel(level) {
    // repartimos el mismo nivel con algo de jitter visual entre barras
    bars.forEach((b, i) => {
      const jitter = 0.6 + Math.random() * 0.4;
      const h = Math.max(4, Math.round(level * jitter * 56));
      b.style.height = h + "px";
      b.style.background = h > 40 ? "var(--bad)" : (h > 20 ? "var(--amber)" : "var(--hairline)");
    });
  }

  recordBtn.addEventListener("click", async () => {
    if (OARecorder.isRecording()) {
      OARecorder.stop();
      return;
    }
    setStatus("");
    const started = await OARecorder.start({
      onLevel: updateMeterFromLevel,
      onTick: elapsed => { timerEl.textContent = fmtTime(elapsed); },
      onStop: handleRecordingStop,
      onError: msg => setStatus(msg, "error"),
    });
    if (started) {
      recordBtn.classList.add("recording");
      hintEl.textContent = "Grabando… tocá de nuevo para detener.";
      timerEl.classList.remove("idle");
      timerEl.classList.add("active");
    }
  });

  async function handleRecordingStop(blob, mime, ext) {
    recordBtn.classList.remove("recording");
    timerEl.classList.remove("active");
    timerEl.classList.add("idle");
    timerEl.textContent = "00:00";
    resetMeter();

    if (blob.size < 800) {
      setStatus("La grabación fue demasiado corta. Probá de nuevo.", "error");
      hintEl.textContent = "Tocá para grabar.";
      return;
    }

    hintEl.textContent = "Procesando…";
    recordBtn.disabled = true;
    setStatus("Analizando el audio…", "info");

    const language = ensureLanguage();
    const form = new FormData();
    form.append("file", blob, "audio." + ext);
    form.append("language", language);

    try {
      const res = await fetch("/api/transcribe-gemini", { method: "POST", body: form });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = (data && (data.error?.message || data.error)) || ("Error HTTP " + res.status);
        setStatus("No se pudo procesar el audio: " + msg, "error");
        return;
      }

      const content = (data && data.text) || "";
      if (!content) {
        setStatus("El audio no generó contenido para guardar.", "error");
        return;
      }

      lastEntry = OA.addEntry({ content, language });
      showLastEntry(lastEntry);
      setStatus("Entrada guardada.", "info");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      setStatus("Error de red al procesar el audio: " + err.message, "error");
    } finally {
      hintEl.textContent = "Tocá para grabar.";
      recordBtn.disabled = false;
    }
  }

  function showLastEntry(entry) {
    lastEntryPanel.hidden = false;
    lastEntryMeta.textContent = `${entry.date} · ${entry.time}`;
    lastEntryContent.textContent = entry.content;
    lastEntryContent.hidden = false;
    lastEntryEdit.hidden = true;
    saveEditBtn.hidden = true;
    editLastBtn.hidden = false;
  }

  editLastBtn.addEventListener("click", () => {
    if (!lastEntry) return;
    lastEntryEdit.value = lastEntry.content;
    lastEntryContent.hidden = true;
    lastEntryEdit.hidden = false;
    editLastBtn.hidden = true;
    saveEditBtn.hidden = false;
  });

  saveEditBtn.addEventListener("click", () => {
    if (!lastEntry) return;
    const updated = OA.updateEntry(lastEntry.date, lastEntry.id, lastEntryEdit.value);
    if (updated) {
      lastEntry = updated;
      showLastEntry(lastEntry);
    }
  });

  discardLastBtn.addEventListener("click", () => {
    if (!lastEntry) return;
    if (confirm("¿Descartar esta entrada?")) {
      OA.deleteEntry(lastEntry.date, lastEntry.id);
      lastEntry = null;
      lastEntryPanel.hidden = true;
    }
  });

  // ---------------- Historial ----------------
  const historialList = document.getElementById("historialList");

  function renderHistorial() {
    const dates = OA.getDates();
    if (dates.length === 0) {
      historialList.innerHTML = '<p class="empty">Todavía no hay entradas. Grabá algo desde Home.</p>';
      return;
    }

    historialList.innerHTML = "";
    dates.forEach(date => {
      const entries = OA.getEntriesForDate(date);
      const details = document.createElement("details");
      details.className = "day-group";

      const summary = document.createElement("summary");
      summary.className = "day-summary";
      summary.innerHTML = `<span>${date}</span><span class="count">${entries.length} entrada${entries.length === 1 ? "" : "s"}</span>`;
      details.appendChild(summary);

      const body = document.createElement("div");
      body.className = "day-body";

      entries.forEach(entry => {
        const item = document.createElement("div");
        item.className = "day-entry";
        item.innerHTML = `
          <div class="time">${entry.time}</div>
          <div class="content"></div>
          <div class="row-actions">
            <button class="btn-ghost" data-action="edit">Editar</button>
            <button class="btn-ghost btn-danger" data-action="delete">Eliminar</button>
          </div>
        `;
        item.querySelector(".content").textContent = entry.content;

        item.querySelector('[data-action="edit"]').addEventListener("click", () => {
          const contentEl = item.querySelector(".content");
          const isEditing = contentEl.tagName === "TEXTAREA";
          if (!isEditing) {
            const textarea = document.createElement("textarea");
            textarea.className = "entry-textarea";
            textarea.value = entry.content;
            contentEl.replaceWith(textarea);
            item.querySelector('[data-action="edit"]').textContent = "Guardar";
          } else {
            const updated = OA.updateEntry(date, entry.id, contentEl.value);
            if (updated) renderHistorial();
          }
        });

        item.querySelector('[data-action="delete"]').addEventListener("click", () => {
          if (confirm("¿Eliminar esta entrada?")) {
            OA.deleteEntry(date, entry.id);
            renderHistorial();
          }
        });

        body.appendChild(item);
      });

      details.appendChild(body);
      historialList.appendChild(details);
    });
  }

  // ---------------- Init ----------------
  ensureLanguage();
  initConfigView();
  render(currentRoute());

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.error("SW error:", err));
    });
  }
})();
