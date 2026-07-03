// Cloudflare Pages Function
// Route: POST /api/transcribe-gemini
//
// Recibe una nota de voz y devuelve el CONTENIDO de una entrada de diario
// de autoanálisis: un resumen breve y fiel, en tercera persona, de lo que
// la persona expresó (hechos, decisiones, pensamientos, emociones).
// No es una transcripción literal palabra por palabra.
//
// La API key se lee del Secret env.GEMINI_API_KEY y nunca se expone al cliente.
//
// Configurar el secret con:
//   npx wrangler pages secret put GEMINI_API_KEY
// o desde el dashboard de Cloudflare Pages -> Settings -> Environment variables -> Secret

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return json({ error: { message: "GEMINI_API_KEY no está configurada en este entorno." } }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return json({ error: { message: "No se pudo leer el audio enviado." } }, 400);
  }

  const audioFile = form.get("file");
  if (!audioFile) {
    return json({ error: { message: "Falta el archivo de audio ('file')." } }, 400);
  }

  const language = (form.get("language") || "es").toString();

  const promptText = `Sos un asistente de journaling. Vas a escuchar una nota de voz en la que una persona habla libremente y en primera persona sobre su día, sus pensamientos o sus emociones, como si estuviera pensando en voz alta para sí misma.

Tu tarea es escribir el CONTENIDO de una entrada de diario de autoanálisis a partir de eso, seguido estas reglas:
- Escribí en tercera persona (por ejemplo "El usuario comentó que...", "Se decidió...", "Notó que sentía...").
- Sé fiel a lo dicho: no inventes ni interpretes de más lo que la persona no haya expresado.
- Conservá los hechos, decisiones, pensamientos y emociones relevantes, incluso si hay varios temas en el mismo audio.
- Podés usar más de un párrafo breve si se hablaron temas distintos, pero no uses encabezados, títulos, listas ni formato Markdown: solo texto plano en párrafos.
- Escribí en el idioma con código ISO-639-1 "${language}", sin importar en qué idioma haya hablado la persona.
- Si el audio no tiene contenido entendible (silencio, ruido, etc.), respondé únicamente con: [Audio sin contenido reconocible]`;

  let base64Audio;
  try {
    const buffer = await audioFile.arrayBuffer();
    base64Audio = arrayBufferToBase64(buffer);
  } catch (err) {
    return json({ error: { message: "No se pudo procesar el audio recibido." } }, 400);
  }

  const mimeType = audioFile.type || "audio/webm";

  const geminiBody = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Audio } },
          { text: promptText },
        ],
      },
    ],
  };

  let geminiResponse;
  try {
    geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    return json({ error: { message: "No se pudo contactar a Gemini: " + err.message } }, 502);
  }

  const raw = await geminiResponse.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return json({ error: { message: "Respuesta inválida de Gemini." } }, 502);
  }

  if (!geminiResponse.ok) {
    const msg = data?.error?.message || `Error HTTP ${geminiResponse.status}`;
    return json({ error: { message: msg } }, geminiResponse.status);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";

  if (!text) {
    return json({ error: { message: "Gemini no devolvió texto (posible bloqueo de safety filters)." } }, 502);
  }

  return json({ text, model: GEMINI_MODEL });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // evitar exceder el límite de argumentos de String.fromCharCode
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
