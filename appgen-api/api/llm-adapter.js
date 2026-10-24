// Provider adapters for the tailor pipeline (Vercel AI Gateway, OpenCode, Anthropic).

export const OPENCODE_MIMO = "mimo-v2.6-flash-free";
export const OPENCODE_NEMOTRON = "nemotron-3-ultra-free";

/** Single Gateway model for every tailor tier (cheap/mid/strong → same). */
export const GATEWAY_FLASH =
  process.env.VERCEL_GATEWAY_MODEL ||
  process.env.VERCEL_GATEWAY_MODEL_CHEAP ||
  process.env.AI_GATEWAY_MODEL_CHEAP ||
  "nvidia/nemotron-3.5-lightning-free";
/** @deprecated Kept for imports; Gateway no longer routes strong → Laguna. */
export const GATEWAY_STRONG = GATEWAY_FLASH;

const GATEWAY_CHAT_URL =
  (process.env.VERCEL_AI_GATEWAY_BASE ||
    process.env.AI_GATEWAY_BASE_URL ||
    "https://ai-gateway.vercel.sh/v1").replace(/\/$/, "") + "/chat/completions";

const ANTHROPIC_DEFAULTS = {
  cheap: process.env.ANTHROPIC_MODEL_CHEAP || "claude-haiku-4-5",
  mid: process.env.ANTHROPIC_MODEL_MID || "claude-sonnet-5-5",
  strong: process.env.ANTHROPIC_MODEL_STRONG || "claude-sonnet-5-5"
};

/** @typedef {"auto"|"vercel"|"opencode"|"anthropic"} LlmProvider */
/** @typedef {"cheap"|"mid"|"strong"} LlmTier */

export function resolveGatewayApiKey() {
  return (
    process.env.VERCEL_AI_GATEWAY_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    ""
  ).trim();
}

export function resolveOpencodeApiKey(deps) {
  return (deps && deps.opencodeApiKey) || process.env.OPENCODE_API_KEY || "";
}

/**
 * @param {unknown} raw
 * @returns {{ provider: LlmProvider }}
 */
export function normalizeLlmRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { provider: "auto" };
  }
  const p = raw.provider;
  if (p === "opencode") return { provider: "opencode" };
  if (p === "anthropic") return { provider: "anthropic" };
  if (p === "vercel") return { provider: "vercel" };
  return { provider: "auto" };
}

/**
 * @param {{ provider: LlmProvider }} prefs
 */
export function resolveModelPlan(prefs) {
  if (prefs.provider === "opencode") {
    return {
      provider: "opencode",
      cheap: OPENCODE_MIMO,
      mid: OPENCODE_MIMO,
      strong: OPENCODE_NEMOTRON
    };
  }
  if (prefs.provider === "vercel" || prefs.provider === "auto") {
    // Pin all tiers to Nemotron Lightning — no Laguna / cheap-vs-strong split.
    return {
      provider: prefs.provider === "auto" ? "auto" : "vercel",
      cheap: GATEWAY_FLASH,
      mid: GATEWAY_FLASH,
      strong: GATEWAY_FLASH
    };
  }
  return {
    provider: "anthropic",
    cheap: ANTHROPIC_DEFAULTS.cheap,
    mid: ANTHROPIC_DEFAULTS.mid,
    strong: ANTHROPIC_DEFAULTS.strong
  };
}

export function llmPlanHash(plan) {
  return plan.provider + "|" + plan.cheap + "|" + plan.mid + "|" + plan.strong;
}

export function llmCacheHash(prefs) {
  if (prefs.provider === "auto") {
    return "auto|" + llmPlanHash(resolveModelPlan({ provider: "vercel" })) +
      "|" + llmPlanHash(resolveModelPlan({ provider: "opencode" }));
  }
  return llmPlanHash(resolveModelPlan(prefs));
}

function extractOpenAiText(body) {
  if (!body || typeof body !== "object") return "";
  const choice = Array.isArray(body.choices) && body.choices[0];
  if (!choice) return "";
  const msg = choice.message || {};
  if (typeof msg.content === "string" && msg.content.trim()) return msg.content;
  if (Array.isArray(msg.content)) {
    const textParts = msg.content
      .filter(p => p && (p.type === "text" || p.type === "output_text") && typeof p.text === "string")
      .map(p => p.text);
    if (textParts.join("").trim()) return textParts.join("");
    const anyText = msg.content
      .filter(p => p && typeof p.text === "string" && p.type !== "reasoning")
      .map(p => p.text);
    if (anyText.join("").trim()) return anyText.join("");
  }
  if (typeof choice.text === "string" && choice.text.trim()) return choice.text;
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text;
  return "";
}

function buildChatCompletionBody({ model, maxTokens, temperature, system, user, jsonMode }) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };
  /* Reasoning models on Gateway often leave message.content empty unless effort is none. */
  body.reasoning = { effort: "none" };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }
  return body;
}

export function isRetryableLlmError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /HTTP 401|HTTP 403|HTTP 429|HTTP 5\d\d|not configured|usage limit|rate.?limit|regain access|timeout|ECONNRESET|fetch failed|allowlist|restricted access to this provider|empty model output|temporarily unavailable|service unavailable/i.test(msg);
}

/** Gateway overload / rate limit — user can pause and click Continue. */
export function isPausableLlmError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /HTTP 503|HTTP 502|HTTP 504|HTTP 429|temporarily unavailable|service unavailable|rate.?limit|overloaded|try again shortly/i.test(msg);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createOpenAiChatAdapter({ provider, apiKey, chatUrl, modelPlan, fetchFn }) {
  if (!apiKey) throw new Error(provider + " API key not configured");
  const fetchImpl = fetchFn || globalThis.fetch;
  return {
    provider,
    modelForTier(tier) {
      return modelPlan[tier] || modelPlan.cheap;
    },
    async complete({ tier, system, user, maxTokens, temperature, jsonMode }) {
      const model = modelPlan[tier] || modelPlan.cheap;
      const res = await fetchImpl(chatUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildChatCompletionBody({
          model, maxTokens, temperature, system, user, jsonMode: !!jsonMode
        }))
      });
      const raw = await res.text();
      let body;
      try {
        body = JSON.parse(raw);
      } catch (e) {
        throw new Error(provider + " HTTP " + res.status + " — non-JSON: " + raw.slice(0, 200));
      }
      if (!res.ok) {
        const msg = (body.error && (body.error.message || body.error)) || raw;
        throw new Error(
          provider + " HTTP " + res.status + " " +
          (typeof msg === "string" ? msg : JSON.stringify(msg)).slice(0, 400)
        );
      }
      const text = extractOpenAiText(body);
      if (!text.trim() && body && body.choices && body.choices[0]) {
        const finish = body.choices[0].finish_reason || "";
        throw new Error(
          provider + " empty model output (finish_reason=" + finish + ") — try fallback provider"
        );
      }
      return text;
    }
  };
}

function createAnthropicAdapter(anthropicFactory, modelPlan) {
  let client = null;
  const getClient = () => {
    if (!client) {
      const factory = anthropicFactory;
      if (!factory) throw new Error("Anthropic client not configured");
      client = typeof factory === "function" ? factory() : factory;
    }
    return client;
  };
  return {
    provider: "anthropic",
    modelForTier(tier) {
      return modelPlan[tier] || modelPlan.cheap;
    },
    async complete({ tier, system, user, maxTokens, temperature }) {
      const model = modelPlan[tier] || modelPlan.cheap;
      const res = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        system,
        temperature,
        messages: [{ role: "user", content: user }]
      });
      return (res.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    }
  };
}

/**
 * Build the adapter used for one tailor request.
 * @param {{ provider: LlmProvider }} prefs
 * @param {object} deps
 */
export function buildPipelineAdapter(prefs, deps) {
  const fetchFn = deps.fetchFn;
  const modelPlan = resolveModelPlan(prefs);

  if (prefs.provider === "anthropic") {
    return {
      adapter: createAnthropicAdapter(deps.anthropic, modelPlan),
      modelPlan,
      effectiveProvider: "anthropic"
    };
  }

  if (prefs.provider === "vercel") {
    const key = deps.gatewayApiKey || resolveGatewayApiKey();
    return {
      adapter: createOpenAiChatAdapter({
        provider: "vercel",
        apiKey: key,
        chatUrl: GATEWAY_CHAT_URL,
        modelPlan,
        fetchFn
      }),
      modelPlan,
      effectiveProvider: "vercel"
    };
  }

  if (prefs.provider === "opencode") {
    const key = resolveOpencodeApiKey(deps);
    const chatUrl = (deps.opencodeBaseUrl || process.env.OPENCODE_INFERENCE_BASE ||
      "https://opencode.ai/inference/openai/v1/chat/completions").replace(/\/$/, "");
    const oPlan = resolveModelPlan({ provider: "opencode" });
    return {
      adapter: createOpenAiChatAdapter({
        provider: "opencode",
        apiKey: key,
        chatUrl,
        modelPlan: oPlan,
        fetchFn
      }),
      modelPlan: oPlan,
      effectiveProvider: "opencode"
    };
  }

  /* auto: Vercel AI Gateway first, OpenCode per call on retryable failure */
  const vPlan = resolveModelPlan({ provider: "vercel" });
  const oPlan = resolveModelPlan({ provider: "opencode" });
  const gatewayKey = deps.gatewayApiKey || resolveGatewayApiKey();
  const opencodeKey = resolveOpencodeApiKey(deps);
  let vercelAdapter = null;
  let opencodeAdapter = null;
  try {
    if (gatewayKey) {
      vercelAdapter = createOpenAiChatAdapter({
        provider: "vercel",
        apiKey: gatewayKey,
        chatUrl: GATEWAY_CHAT_URL,
        modelPlan: vPlan,
        fetchFn
      });
    }
  } catch (e) { /* no key */ }
  try {
    if (opencodeKey) {
      opencodeAdapter = createOpenAiChatAdapter({
        provider: "opencode",
        apiKey: opencodeKey,
        chatUrl: (deps.opencodeBaseUrl || process.env.OPENCODE_INFERENCE_BASE ||
          "https://opencode.ai/inference/openai/v1/chat/completions").replace(/\/$/, ""),
        modelPlan: oPlan,
        fetchFn
      });
    }
  } catch (e) { /* no key */ }

  const adapter = {
    provider: "auto",
    hasFallback: !!opencodeAdapter,
    modelForTier(tier) {
      return (vercelAdapter || opencodeAdapter).modelForTier(tier);
    },
    async completeFallback(params) {
      if (!opencodeAdapter) throw new Error("auto: OpenCode fallback not configured");
      return opencodeAdapter.complete(params);
    },
    async complete(params) {
      if (vercelAdapter) {
        try {
          return await vercelAdapter.complete(params);
        } catch (e) {
          if (opencodeAdapter && (isRetryableLlmError(e) || /empty model output/i.test(e.message))) {
            return opencodeAdapter.complete(params);
          }
          throw e;
        }
      }
      if (opencodeAdapter) return opencodeAdapter.complete(params);
      throw new Error("auto: neither VERCEL_AI_GATEWAY_API_KEY nor OPENCODE_API_KEY configured");
    }
  };

  return { adapter, modelPlan: vPlan, effectiveProvider: "auto" };
}

/** @deprecated use buildPipelineAdapter — kept for tests injecting a single adapter */
export function createLlmAdapter(opts) {
  const plan = resolveModelPlan({ provider: opts.provider || "anthropic" });
  if (opts.provider === "opencode") {
    return createOpenAiChatAdapter({
      provider: "opencode",
      apiKey: opts.opencodeApiKey || process.env.OPENCODE_API_KEY,
      chatUrl: opts.opencodeBaseUrl || "https://opencode.ai/inference/openai/v1/chat/completions",
      modelPlan: plan,
      fetchFn: opts.fetchFn
    });
  }
  return createAnthropicAdapter(opts.anthropicFactory, plan);
}

export function assertLlmConfigured(prefs, deps) {
  const p = prefs.provider;
  if (p === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY && !deps.anthropic) {
      return "LLM tailoring not configured (ANTHROPIC_API_KEY)";
    }
    return null;
  }
  if (p === "vercel") {
    if (!resolveGatewayApiKey() && !deps.gatewayApiKey) {
      return "Vercel AI Gateway not configured (VERCEL_AI_GATEWAY_API_KEY)";
    }
    return null;
  }
  if (p === "opencode") {
    if (!resolveOpencodeApiKey(deps)) {
      return "OpenCode tailoring not configured (OPENCODE_API_KEY)";
    }
    return null;
  }
  if (!resolveGatewayApiKey() && !deps.gatewayApiKey && !resolveOpencodeApiKey(deps)) {
    return "AI tailoring not configured (set VERCEL_AI_GATEWAY_API_KEY and/or OPENCODE_API_KEY)";
  }
  return null;
}
