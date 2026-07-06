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
    "/instructivo": document.getElementById("view-instructivo"),
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
      queue = [];
      queueList.innerHTML = "";
      queuePanel.hidden = true;
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

  const queuePanel = document.getElementById("queuePanel");
  const queueList = document.getElementById("queueList");

  // Cola en memoria: grabar y transcribir están desacoplados. Se puede
  // seguir grabando aunque el audio anterior todavía se esté procesando.
  // Se procesa en orden (FIFO) y de a uno, para respetar el orden
  // cronológico de lo dicho y no saturar la API con requests simultáneos.
  let queue = [];
  let isProcessing = false;
  let jobSeq = 0;

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

  function pad2(n) { return n.toString().padStart(2, "0"); }
  function clockLabel(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }

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
      // deshabilitado brevemente sólo hasta que el blob termine de
      // finalizarse (evita pisar el stream si se toca de nuevo muy rápido)
      recordBtn.disabled = true;
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

  function handleRecordingStop(blob, mime, ext) {
    recordBtn.classList.remove("recording");
    recordBtn.disabled = false;
    timerEl.classList.remove("active");
    timerEl.classList.add("idle");
    timerEl.textContent = "00:00";
    resetMeter();
    hintEl.textContent = "Tocá para grabar.";

    if (blob.size < 800) {
      setStatus("La grabación fue demasiado corta. Probá de nuevo.", "error");
      return;
    }

    setStatus("");
    addJob(blob, ext);
  }

  // ---- cola de transcripción ----

  function addJob(blob, ext) {
    const job = { id: "q" + (++jobSeq), blob, ext, recordedAt: new Date(), status: "queued", content: "", errorMsg: "" };
    queue.push(job);
    queuePanel.hidden = false;
    renderQueueItem(job);
    processQueue();
  }

  function updateQueuePanelVisibility() {
    queuePanel.hidden = queue.length === 0;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderQueueItem(job) {
    let el = document.getElementById(job.id);
    if (!el) {
      el = document.createElement("div");
      el.id = job.id;
      el.className = "queue-item";
      queueList.prepend(el); // más reciente arriba
    }

    const clock = clockLabel(job.recordedAt);

    if (job.status === "queued") {
      el.innerHTML = `<div class="entry-meta">${clock} · <span class="q-status">En cola…</span></div>`;
    } else if (job.status === "processing") {
      el.innerHTML = `<div class="entry-meta">${clock} · <span class="q-status q-processing">Transcribiendo…</span></div>`;
    } else if (job.status === "error") {
      el.innerHTML = `
        <div class="entry-meta">${clock} · <span class="q-status q-error">Error</span></div>
        <p class="field-hint">${escapeHtml(job.errorMsg)}</p>
        <div class="entry-actions">
          <button class="btn-ghost" data-action="retry">Reintentar</button>
          <button class="btn-ghost btn-danger" data-action="dismiss">Descartar</button>
        </div>
      `;
      el.querySelector('[data-action="retry"]').addEventListener("click", () => {
        job.status = "queued";
        renderQueueItem(job);
        processQueue();
      });
      el.querySelector('[data-action="dismiss"]').addEventListener("click", () => {
        queue = queue.filter(j => j.id !== job.id);
        el.remove();
        updateQueuePanelVisibility();
      });
    } else if (job.status === "done") {
      el.innerHTML = `
        <div class="entry-meta">${clock}</div>
        <div class="entry-content"></div>
        <textarea class="entry-textarea" hidden></textarea>
        <div class="entry-actions">
          <button class="btn-ghost" data-action="edit">Editar</button>
          <button class="btn-ghost" data-action="save" hidden>Guardar cambios</button>
          <button class="btn-ghost btn-danger" data-action="discard">Descartar</button>
        </div>
      `;
      const contentEl = el.querySelector(".entry-content");
      const textarea = el.querySelector("textarea");
      const editBtn = el.querySelector('[data-action="edit"]');
      const saveBtn = el.querySelector('[data-action="save"]');
      contentEl.textContent = job.content;

      editBtn.addEventListener("click", () => {
        textarea.value = job.content;
        contentEl.hidden = true;
        textarea.hidden = false;
        editBtn.hidden = true;
        saveBtn.hidden = false;
      });
      saveBtn.addEventListener("click", () => {
        const updated = OA.updateEntry(job.entry.date, job.entry.id, textarea.value);
        if (updated) {
          job.entry = updated;
          job.content = updated.content;
          renderQueueItem(job);
        }
      });
      el.querySelector('[data-action="discard"]').addEventListener("click", () => {
        if (confirm("¿Descartar esta entrada?")) {
          OA.deleteEntry(job.entry.date, job.entry.id);
          queue = queue.filter(j => j.id !== job.id);
          el.remove();
          updateQueuePanelVisibility();
        }
      });
    }
  }

  async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    let job;
    while ((job = queue.find(j => j.status === "queued"))) {
      job.status = "processing";
      renderQueueItem(job);

      const language = ensureLanguage();
      const form = new FormData();
      form.append("file", job.blob, "audio." + job.ext);
      form.append("language", language);

      try {
        const res = await fetch("/api/transcribe-gemini", { method: "POST", body: form });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          job.status = "error";
          job.errorMsg = (data && (data.error?.message || data.error)) || ("Error HTTP " + res.status);
        } else {
          const content = (data && data.text) || "";
          if (!content) {
            job.status = "error";
            job.errorMsg = "El audio no generó contenido para guardar.";
          } else {
            job.entry = OA.addEntry({ content, language });
            job.content = content;
            job.status = "done";
          }
        }
      } catch (err) {
        job.status = "error";
        job.errorMsg = "Error de red: " + err.message;
      }

      renderQueueItem(job);
    }

    isProcessing = false;
  }

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
