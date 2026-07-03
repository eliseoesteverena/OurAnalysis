/**
 * storage.js
 * -----------------------------------------------------------------------
 * Abstracción de almacenamiento para las entradas del diario.
 *
 * Hoy persiste todo en localStorage, pero el esquema está pensado para
 * migrar sin fricción a:
 *   - Cloudflare D1  -> una fila por entrada, misma forma que `Entry` abajo.
 *   - Cloudflare R2  -> un objeto .txt por día (`entries/{date}.txt`),
 *                       con exactamente el contenido de renderDayMarkdown().
 *
 * El resto de la app (home.js, historial.js) sólo debería hablar con las
 * funciones exportadas acá abajo. El día que esto pase a llamar a un
 * Worker con fetch() en vez de localStorage, ninguna otra pantalla debería
 * necesitar cambios.
 * -----------------------------------------------------------------------
 *
 * Entry (misma forma que una futura fila de D1):
 *   {
 *     id:        string  // uuid
 *     date:      string  // 'YYYY-MM-DD' (ISO 8601, fecha local del usuario)
 *     time:      string  // 'HH:MM' (24h, hora local del usuario)
 *     content:   string  // texto de la entrada
 *     createdAt: string  // ISO 8601 datetime completo, para orden fehaciente
 *     language:  string  // ISO-639-1 usado para generar el contenido
 *   }
 *
 * Claves en localStorage:
 *   oa:settings          -> { language }
 *   oa:dates              -> ['2026-07-03', '2026-07-02', ...] desc
 *   oa:entries:{date}     -> [Entry, Entry, ...] asc por hora
 */

const OA = (() => {
  const K_SETTINGS = "oa:settings";
  const K_DATES = "oa:dates";
  const K_ENTRIES_PREFIX = "oa:entries:";

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.error("storage: error leyendo", key, err);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error("storage: error guardando", key, err);
      return false;
    }
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function pad2(n) { return n.toString().padStart(2, "0"); }

  function localDateParts(d = new Date()) {
    return {
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    };
  }

  // ---- settings ----

  function getSettings() {
    return readJSON(K_SETTINGS, { language: null });
  }

  function saveSettings(partial) {
    const current = getSettings();
    const next = { ...current, ...partial };
    writeJSON(K_SETTINGS, next);
    return next;
  }

  // ---- dates index ----

  function getDates() {
    return readJSON(K_DATES, []);
  }

  function addDateToIndex(date) {
    const dates = getDates();
    if (!dates.includes(date)) {
      dates.push(date);
      dates.sort((a, b) => (a < b ? 1 : -1)); // desc, más reciente primero
      writeJSON(K_DATES, dates);
    }
  }

  // ---- entries ----

  function getEntriesForDate(date) {
    return readJSON(K_ENTRIES_PREFIX + date, []);
  }

  function saveEntriesForDate(date, entries) {
    writeJSON(K_ENTRIES_PREFIX + date, entries);
  }

  /**
   * Crea y persiste una nueva entrada con fecha/hora actuales.
   * @param {{content: string, language: string}} data
   * @returns {Entry}
   */
  function addEntry({ content, language }) {
    const now = new Date();
    const { date, time } = localDateParts(now);
    const entry = {
      id: uuid(),
      date,
      time,
      content: content.trim(),
      createdAt: now.toISOString(),
      language: language || "es",
    };

    const entries = getEntriesForDate(date);
    entries.push(entry);
    entries.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    saveEntriesForDate(date, entries);
    addDateToIndex(date);

    return entry;
  }

  function updateEntry(date, id, newContent) {
    const entries = getEntriesForDate(date);
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return null;
    entries[idx] = { ...entries[idx], content: newContent.trim() };
    saveEntriesForDate(date, entries);
    return entries[idx];
  }

  function deleteEntry(date, id) {
    const entries = getEntriesForDate(date).filter(e => e.id !== id);
    saveEntriesForDate(date, entries);
    if (entries.length === 0) {
      localStorage.removeItem(K_ENTRIES_PREFIX + date);
      const dates = getDates().filter(d => d !== date);
      writeJSON(K_DATES, dates);
    }
    return entries;
  }

  /**
   * Arma el texto exacto que representa un día completo, con el formato
   * pedido (encabezado de fecha, subtítulos de hora, separador de 3 guiones).
   * Es el mismo contenido que eventualmente se sube a R2 como
   * `entries/{date}.txt`.
   */
  function renderDayMarkdown(date) {
    const entries = getEntriesForDate(date);
    if (entries.length === 0) return "";

    let out = `# ${date}\n\n`;
    entries.forEach((entry, i) => {
      out += `## ${entry.time}\n${entry.content}\n`;
      if (i < entries.length - 1) out += `\n---\n\n`;
    });
    return out;
  }

  /** Elimina todos los datos locales (entradas + configuración). */
  function clearAll() {
    const dates = getDates();
    dates.forEach(d => localStorage.removeItem(K_ENTRIES_PREFIX + d));
    localStorage.removeItem(K_DATES);
    localStorage.removeItem(K_SETTINGS);
  }

  return {
    getSettings,
    saveSettings,
    getDates,
    getEntriesForDate,
    addEntry,
    updateEntry,
    deleteEntry,
    renderDayMarkdown,
    clearAll,
  };
})();
