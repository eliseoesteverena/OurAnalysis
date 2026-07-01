// Cloudflare Pages Function
// Route: POST /api/transcribe
//
// Recibe el audio grabado en el navegador y lo reenvía a la API de Groq,
// usando la API key guardada como Secret (env.GROQ_API_KEY) para que
// nunca quede expuesta en el cliente.
//
// Configurar el secret con:
//   npx wrangler pages secret put GROQ_API_KEY
// o desde el dashboard de Cloudflare Pages -> Settings -> Environment variables -> Secret

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GROQ_API_KEY) {
    return json({ error: "GROQ_API_KEY no está configurada en este entorno." }, 500);
  }

  let incomingForm;
  try {
    incomingForm = await request.formData();
  } catch (err) {
    return json({ error: "No se pudo leer el audio enviado." }, 400);
  }

  const audioFile = incomingForm.get("file");
  if (!audioFile) {
    return json({ error: "Falta el archivo de audio ('file')." }, 400);
  }

  // Parámetros opcionales que puede mandar el cliente
  const model = incomingForm.get("model") || "whisper-large-v3-turbo";
  const language = incomingForm.get("language"); // puede venir vacío
  const responseFormat = incomingForm.get("response_format") || "verbose_json";
  const prompt = incomingForm.get("prompt");

  const outgoingForm = new FormData();
  outgoingForm.append("file", audioFile, audioFile.name || "audio.webm");
  outgoingForm.append("model", model);
  outgoingForm.append("response_format", responseFormat);
  outgoingForm.append("temperature", "0");
  if (language) outgoingForm.append("language", language);
  if (prompt) outgoingForm.append("prompt", prompt);
  if (responseFormat === "verbose_json") {
    outgoingForm.append("timestamp_granularities[]", "segment");
  }

  const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: outgoingForm,
  });

  const text = await groqResponse.text();

  // Reenviamos tal cual el status y el body (json o texto) que devuelve Groq
  return new Response(text, {
    status: groqResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
