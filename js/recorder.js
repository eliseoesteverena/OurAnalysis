/**
 * recorder.js
 * -----------------------------------------------------------------------
 * Encapsula todo lo relacionado a grabar audio del micrófono en mobile:
 * permisos, medidor de nivel liviano, selección de mimeType soportado,
 * y liberación de recursos. No sabe nada de la UI del diario ni de la API.
 * -----------------------------------------------------------------------
 */

const OARecorder = (() => {
  const MAX_SECONDS = 180; // tope de seguridad para no grabar audios enormes

  let mediaStream = null;
  let mediaRecorder = null;
  let chunks = [];
  let audioCtx = null;
  let analyser = null;
  let rafId = null;
  let timerInterval = null;
  let startTime = 0;
  let recording = false;

  // callbacks que la UI puede setear
  let onLevel = null;   // (0..1) por frame, para el medidor visual
  let onTick = null;    // (segundosTranscurridos) cada ~200ms
  let onStop = null;    // (blob, mimeType)
  let onError = null;   // (mensaje)

  function pickMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4", // Safari / iOS
      "audio/ogg;codecs=opus",
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return "";
  }

  function extForMime(mime) {
    if (mime.includes("mp4")) return "m4a";
    if (mime.includes("ogg")) return "ogg";
    return "webm";
  }

  function tickMeter() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const level = Math.min(1, sum / data.length / 130);
    if (onLevel) onLevel(level);
    rafId = requestAnimationFrame(tickMeter);
  }

  function cleanupStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    analyser = null;
  }

  async function start(callbacks = {}) {
    onLevel = callbacks.onLevel || null;
    onTick = callbacks.onTick || null;
    onStop = callbacks.onStop || null;
    onError = callbacks.onError || null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError && onError("Este navegador no soporta acceso al micrófono.");
      return false;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        onError && onError("Permiso de micrófono denegado. Habilitalo desde los ajustes del navegador/sitio.");
      } else if (err.name === "NotFoundError") {
        onError && onError("No se encontró ningún micrófono en este dispositivo.");
      } else {
        onError && onError("No se pudo acceder al micrófono: " + err.message);
      }
      return false;
    }

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      tickMeter();
    } catch (e) { /* si falla el medidor, seguimos igual sin visualización */ }

    const mime = pickMimeType();
    chunks = [];
    try {
      mediaRecorder = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream);
    } catch (e) {
      onError && onError("No se pudo iniciar el grabador de audio: " + e.message);
      cleanupStream();
      return false;
    }

    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    recording = true;
    startTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (onTick) onTick(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 200);

    return true;
  }

  function handleStop() {
    cleanupStream();
    const mime = (mediaRecorder && mediaRecorder.mimeType) || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    chunks = [];
    if (onStop) onStop(blob, mime, extForMime(mime));
  }

  function stop() {
    if (!recording || !mediaRecorder) return;
    recording = false;
    clearInterval(timerInterval);
    timerInterval = null;
    if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
  }

  function isRecording() { return recording; }

  // liberar el micrófono si el usuario cambia de pestaña/app mientras graba
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && recording) stop();
  });

  return { start, stop, isRecording, MAX_SECONDS };
})();
