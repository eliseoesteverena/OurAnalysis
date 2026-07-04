/**
 * export.js — sheet de exportación del Historial a .txt
 * -----------------------------------------------------------------------
 * "Última semana" / "Semana anterior" se resuelven como ventanas rodantes
 * de 7 días (hoy incluido para la primera), no semana calendario. Se eligió
 * así porque el rango exacto siempre se muestra en pantalla (rangePreview),
 * así que la ambigüedad del nombre queda resuelta por la fecha que se ve.
 * -----------------------------------------------------------------------
 */
(function () {
  const overlay = document.getElementById("exportOverlay");
  const sheet = document.getElementById("exportSheet");
  const openBtn = document.getElementById("openExportBtn");
  const cancelBtn = document.getElementById("cancelExportBtn");
  const confirmBtn = document.getElementById("confirmExportBtn");
  const customFields = document.getElementById("customRangeFields");
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");
  const rangePreview = document.getElementById("rangePreview");
  const rangeFeedback = document.getElementById("rangeFeedback");
  const radios = Array.from(document.querySelectorAll('input[name="range"]'));

  let pendingDates = [];

  function pad2(n) { return n.toString().padStart(2, "0"); }

  function addDays(isoDate, delta) {
    const d = new Date(isoDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatDisplay(isoDate) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }

  function selectedPreset() {
    const checked = radios.find(r => r.checked);
    return checked ? checked.value : "hoy";
  }

  function computeRange(preset) {
    const today = OA.todayDate();
    if (preset === "hoy") return { from: today, to: today };
    if (preset === "semana-actual") return { from: addDays(today, -6), to: today };
    if (preset === "semana-anterior") return { from: addDays(today, -13), to: addDays(today, -7) };
    if (preset === "custom") {
      if (!dateFrom.value || !dateTo.value) return null;
      return { from: dateFrom.value, to: dateTo.value };
    }
    return null;
  }

  function datesInRange(range) {
    if (!range) return [];
    return OA.getDates()
      .filter(d => d >= range.from && d <= range.to)
      .sort(); // ascendente: orden cronológico en el archivo exportado
  }

  function updatePreview() {
    const preset = selectedPreset();
    const range = computeRange(preset);

    if (!range) {
      rangePreview.textContent = "";
      rangeFeedback.textContent = "Elegí ambas fechas.";
      confirmBtn.disabled = true;
      return;
    }
    if (range.from > range.to) {
      rangePreview.textContent = "";
      rangeFeedback.textContent = "\"Desde\" no puede ser posterior a \"Hasta\".";
      confirmBtn.disabled = true;
      return;
    }

    rangePreview.textContent = range.from === range.to
      ? formatDisplay(range.from)
      : `${formatDisplay(range.from)} – ${formatDisplay(range.to)}`;

    pendingDates = datesInRange(range);
    if (pendingDates.length === 0) {
      rangeFeedback.textContent = "No hay entradas guardadas en ese rango.";
      confirmBtn.disabled = true;
    } else {
      rangeFeedback.textContent = `${pendingDates.length} día${pendingDates.length === 1 ? "" : "s"} con entradas.`;
      confirmBtn.disabled = false;
    }
  }

  function buildExportText(dates) {
    return dates.map(d => OA.renderDayMarkdown(d)).join("\n\n");
  }

  function buildFilename(dates) {
    if (dates.length === 1) return `our-analysis_${dates[0]}.txt`;
    return `our-analysis_${dates[0]}_a_${dates[dates.length - 1]}.txt`;
  }

  async function exportAsFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });

    if (navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], filename, { type: "text/plain" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return; // el usuario canceló el share, no hacer fallback
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openSheet() {
    radios.forEach(r => { r.checked = r.value === "hoy"; });
    customFields.hidden = true;
    updatePreview();
    overlay.hidden = false;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    overlay.hidden = true;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }

  openBtn.addEventListener("click", openSheet);
  cancelBtn.addEventListener("click", closeSheet);
  overlay.addEventListener("click", closeSheet);

  radios.forEach(r => r.addEventListener("change", () => {
    customFields.hidden = selectedPreset() !== "custom";
    updatePreview();
  }));
  dateFrom.addEventListener("change", updatePreview);
  dateTo.addEventListener("change", updatePreview);

  confirmBtn.addEventListener("click", async () => {
    if (pendingDates.length === 0) return;
    const text = buildExportText(pendingDates);
    const filename = buildFilename(pendingDates);
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Exportando…";
    try {
      await exportAsFile(filename, text);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Exportar";
      closeSheet();
    }
  });
})();
