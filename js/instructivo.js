/**
 * instructivo.js — prompt sugerido para analizar el historial exportado
 * con un agente de IA externo. Copiar / editar (persistido en localStorage
 * vía OA.settings, igual que el resto de las preferencias de la app).
 */
(function () {
  const DEFAULT_PROMPT = `Quiero que analices mi diario de la última semana y me ayudes a entenderla, aprender de ella y aprovecharla.

Para ello, sigue esta estructura:

⸻

1️⃣ RESUMEN GENERAL

Hazme un resumen breve (máximo 5 frases) que describa el tono general de la semana, los hechos más importantes y las emociones dominantes.
Usa un tono humano y directo, como si me conocieras desde hace tiempo.

⸻

2️⃣ PATRONES Y PISTAS

Enumera los 5 patrones más relevantes que detectes (comportamientos, emociones, repeticiones, decisiones, contradicciones…).
Por cada patrón, indica:
• qué lo causa o lo alimenta,
• qué consecuencias tiene,
• y si es algo a mantener o a cambiar.

⸻

3️⃣ ACCIONES CONCRETAS

Propón 3 acciones específicas y medibles que pueda aplicar la próxima semana.
Evita obviedades: deben ser decisiones reales (cosas que cambiarían mi forma de trabajar, pensar o priorizar).

⸻

4️⃣ HISTORIAS Y CONTENIDO POTENCIAL

Identifica 3 ideas o historias potentes que podrían convertirse en contenido para mi comunidad freelance.
Pueden ser aprendizajes, contradicciones, errores o descubrimientos personales.
Formúlalas como titulares o ganchos iniciales, en tono narrativo, tipo:

"Esta semana descubrí que cuando intento ser más productivo… me vuelvo menos libre."

⸻

5️⃣ APRENDIZAJE CLAVE

Condensa el aprendizaje más importante de la semana en una sola frase poderosa, tipo insight.
(Ejemplo: "Ser constante no es hacerlo cada día, sino volver cada vez que me pierdo.")

⸻

6️⃣ EVALUACIÓN GLOBAL

Por último, puntúa la semana del 0 al 10 según equilibrio, energía y avance.
Explícame brevemente por qué le das esa nota y qué haría falta para subir un punto más la próxima.`;

  const displayEl = document.getElementById("promptDisplay");
  const editEl = document.getElementById("promptEdit");
  const copyBtn = document.getElementById("copyPromptBtn");
  const editBtn = document.getElementById("editPromptBtn");
  const saveBtn = document.getElementById("savePromptBtn");
  const resetBtn = document.getElementById("resetPromptBtn");

  function currentPrompt() {
    const settings = OA.getSettings();
    return settings.instructivoPrompt || DEFAULT_PROMPT;
  }

  function renderPrompt() {
    displayEl.textContent = currentPrompt();
  }

  function enterEdit() {
    editEl.value = currentPrompt();
    displayEl.hidden = true;
    editEl.hidden = false;
    editBtn.hidden = true;
    saveBtn.hidden = false;
    resetBtn.hidden = false;
  }

  function exitEdit() {
    displayEl.hidden = false;
    editEl.hidden = true;
    editBtn.hidden = false;
    saveBtn.hidden = true;
    resetBtn.hidden = true;
  }

  function flashButton(btn, tempLabel) {
    const original = btn.textContent;
    btn.textContent = tempLabel;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1800);
  }

  editBtn.addEventListener("click", enterEdit);

  saveBtn.addEventListener("click", () => {
    const value = editEl.value.trim();
    OA.saveSettings({ instructivoPrompt: value || null });
    renderPrompt();
    exitEdit();
  });

  resetBtn.addEventListener("click", () => {
    if (confirm("¿Restaurar el prompt original? Se pierde lo que hayas editado.")) {
      OA.saveSettings({ instructivoPrompt: null });
      renderPrompt();
      exitEdit();
    }
  });

  copyBtn.addEventListener("click", async () => {
    const text = currentPrompt();
    try {
      await navigator.clipboard.writeText(text);
      flashButton(copyBtn, "Copiado ✓");
    } catch (err) {
      // Fallback si el navegador bloquea la Clipboard API: seleccionar
      // el texto para que el usuario copie manualmente.
      const range = document.createRange();
      range.selectNodeContents(displayEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      flashButton(copyBtn, "Seleccionado, copiá manualmente");
    }
  });

  renderPrompt();
})();
