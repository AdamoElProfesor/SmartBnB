// OpenAI-compatible chat endpoint backed by Workers AI (open-weights models).
// The backend talks to it with the regular OpenAI SDK: baseURL = <worker>/v1, apiKey = AI_API_KEY.
const DEFAULT_MODEL = "@cf/openai/gpt-oss-20b";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message, status) {
  return json({ error: { message } }, status);
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

// Constant-time check: hashing both sides gives equal-length buffers, and the
// loop always walks every byte, so timing reveals nothing about the key.
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      return error("Not found", 404);
    }

    const auth = request.headers.get("Authorization") || "";
    if (!env.AI_API_KEY || !(await safeEqual(auth, `Bearer ${env.AI_API_KEY}`))) {
      return error("Unauthorized", 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return error("Invalid JSON body", 400);
    }
    if (!Array.isArray(body.messages)) return error("messages is required", 400);

    const model = body.model || DEFAULT_MODEL;
    const input = {
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens ?? 800,
    };
    if (body.response_format?.type === "json_object") {
      input.response_format = { type: "json_object" };
    }

    let result;
    try {
      result = await env.AI.run(model, input);
    } catch (e) {
      return error(`Workers AI: ${e.message}`, 502);
    }

    // Workers AI returns either { response } or an OpenAI-style { choices }
    let content = result?.choices?.[0]?.message?.content ?? result?.response ?? "";
    if (typeof content !== "string") content = JSON.stringify(content);

    return json({
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        { index: 0, message: { role: "assistant", content }, finish_reason: "stop" },
      ],
      usage: result?.usage,
    });
  },
};
