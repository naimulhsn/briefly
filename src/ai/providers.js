/**
 * Ordered fallback router for free-tier summarization APIs.
 * Keys are optional; providers without a key are skipped.
 * Never log key values.
 */
import { config } from "../config.js";

export const GEMINI_MODELS = [
  config.geminiModel,
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
].filter((v, i, a) => v && a.indexOf(v) === i);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readError(res) {
  const body = await res.text().catch(() => "");
  const err = new Error(`${res.status}`);
  err.status = res.status;
  err.body = body.slice(0, 300);
  return err;
}

export async function geminiGenerate(prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiKey,
    },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw Object.assign(await readError(res), { message: `Gemini ${res.status} (${model})` });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
}

export async function openaiCompatibleGenerate({ url, apiKey, model, prompt, headers = {} }) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw Object.assign(await readError(res), { message: `HTTP ${res.status} (${model})` });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

const PROVIDERS = [
  {
    id: "gemini",
    enabled: () => Boolean(config.geminiKey),
    async generate(prompt) {
      let lastErr;
      for (const model of GEMINI_MODELS) {
        try {
          const text = await geminiGenerate(prompt, model);
          return { text, processor: `gemini:${model}` };
        } catch (err) {
          lastErr = err;
          if (err.status === 404 || err.status === 400) continue;
          if (err.status === 429) {
            await sleep(20000);
            try {
              const text = await geminiGenerate(prompt, model);
              return { text, processor: `gemini:${model}` };
            } catch (err2) {
              lastErr = err2;
              break; // fall through to the next provider
            }
          } else if (err.status >= 500) {
            continue;
          } else {
            break;
          }
        }
      }
      throw lastErr || new Error("Gemini failed");
    },
  },
  {
    id: "groq",
    enabled: () => Boolean(config.groqKey),
    async generate(prompt) {
      const model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
      const text = await openaiCompatibleGenerate({
        url: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: config.groqKey,
        model,
        prompt,
      });
      return { text, processor: `groq:${model}` };
    },
  },
  {
    id: "openrouter",
    enabled: () => Boolean(config.openrouterKey),
    async generate(prompt) {
      const model = process.env.OPENROUTER_MODEL || "qwen/qwen3-8b:free";
      const text = await openaiCompatibleGenerate({
        url: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: config.openrouterKey,
        model,
        prompt,
        headers: {
          "HTTP-Referer": "https://briefly-as0b.onrender.com",
          "X-Title": "Briefly",
        },
      });
      return { text, processor: `openrouter:${model}` };
    },
  },
  {
    id: "cerebras",
    enabled: () => Boolean(config.cerebrasKey),
    async generate(prompt) {
      const model = process.env.CEREBRAS_MODEL || "qwen-3.8-27b";
      const text = await openaiCompatibleGenerate({
        url: "https://api.cerebras.ai/v1/chat/completions",
        apiKey: config.cerebrasKey,
        model,
        prompt,
      });
      return { text, processor: `cerebras:${model}` };
    },
  },
  {
    id: "mistral",
    enabled: () => Boolean(config.mistralKey),
    async generate(prompt) {
      const model = process.env.MISTRAL_MODEL || "mistral-small-latest";
      const text = await openaiCompatibleGenerate({
        url: "https://api.mistral.ai/v1/chat/completions",
        apiKey: config.mistralKey,
        model,
        prompt,
      });
      return { text, processor: `mistral:${model}` };
    },
  },
  {
    id: "cloudflare",
    enabled: () => Boolean(config.cloudflareAccountId && config.cloudflareToken),
    async generate(prompt) {
      const model = process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
      const url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/${model}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.cloudflareToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "Return valid JSON only." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) throw Object.assign(await readError(res), { message: `Cloudflare ${res.status}` });
      const data = await res.json();
      const text = data?.result?.response || data?.result?.output_text || "";
      return { text, processor: `cloudflare:${model}` };
    },
  },
];

export function configuredProviders() {
  return PROVIDERS.filter((p) => p.enabled()).map((p) => p.id);
}

export function availableProcessor() {
  return configuredProviders()[0] || "heuristic";
}

export async function generateWithFallback(prompt, { log } = {}) {
  const enabled = PROVIDERS.filter((p) => p.enabled());
  if (!enabled.length) {
    const err = new Error("no AI provider configured");
    err.code = "NO_PROVIDER";
    throw err;
  }
  let lastErr;
  for (const provider of enabled) {
    try {
      return await provider.generate(prompt);
    } catch (err) {
      lastErr = err;
      log?.(`${provider.id} failed: ${String(err.message || err).slice(0, 160)}`);
      if (err.status === 429) await sleep(3000);
    }
  }
  throw lastErr || new Error("no AI provider succeeded");
}
