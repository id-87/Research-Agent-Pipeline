const Groq = require("groq-sdk");
const { GoogleGenAI } = require("@google/genai");

// ─── Provider initialization ─────────────────────────────────────────────────
let groqClient = null;
let geminiClient = null;
let activeProvider = null;

function initProviders() {
  if (activeProvider) return; // Already initialized

  // Try Groq first
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "your_groq_api_key_here") {
    try {
      groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
      console.log("[LLM] Groq client initialized");
    } catch (err) {
      console.error("[LLM] Groq init failed:", err.message);
    }
  }

  // Try Gemini
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your_gemini_api_key_here") {
    try {
      geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      console.log("[LLM] Gemini client initialized");
    } catch (err) {
      console.error("[LLM] Gemini init failed:", err.message);
    }
  }

  // Determine active provider
  if (groqClient) {
    activeProvider = "groq";
  } else if (geminiClient) {
    activeProvider = "gemini";
  } else {
    console.error("[LLM] ⚠️  No valid LLM API key found! Set GROQ_API_KEY or GEMINI_API_KEY in .env");
    activeProvider = "none";
  }

  console.log(`[LLM] Active provider: ${activeProvider}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(err) {
  const msg = (err.message || "").toLowerCase();
  return (
    err.status === 429 ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("quota exceeded") ||
    msg.includes("resource exhausted") ||
    msg.includes("too many requests")
  );
}

// ─── Groq call ───────────────────────────────────────────────────────────────
async function callGroq(systemPrompt, userPrompt, temperature = 0.3) {
  const completion = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: 1500,
  });
  return completion.choices[0]?.message?.content || "";
}

// ─── Gemini call ─────────────────────────────────────────────────────────────
async function callGemini(systemPrompt, userPrompt, temperature = 0.3) {
  const response = await geminiClient.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `${systemPrompt}\n\n${userPrompt}`,
    config: {
      temperature,
      maxOutputTokens: 1500,
    },
  });
  return response.text || "";
}

// ─── Try a single provider with retries ──────────────────────────────────────
async function tryProvider(providerName, callFn, systemPrompt, userPrompt, temperature, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callFn(systemPrompt, userPrompt, temperature);
    } catch (err) {
      const isRateLimit = isRateLimitError(err);
      console.error(`[LLM] ${providerName} attempt ${attempt + 1} failed:`, err.message);

      if (isRateLimit && attempt < maxRetries) {
        const delay = (attempt + 1) * 5000; // 5s, 10s
        console.log(`[LLM] Rate limited, waiting ${delay / 1000}s before retry...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

// ─── Main callLLM function (with fallback + retry) ───────────────────────────
async function callLLM(systemPrompt, userPrompt, temperature = 0.3) {
  initProviders();

  if (activeProvider === "none") {
    throw new Error("No LLM provider configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env");
  }

  const providers = [];
  if (activeProvider === "groq") {
    providers.push({ name: "groq", fn: callGroq });
    if (geminiClient) providers.push({ name: "gemini", fn: callGemini });
  } else {
    providers.push({ name: "gemini", fn: callGemini });
    if (groqClient) providers.push({ name: "groq", fn: callGroq });
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      const result = await tryProvider(provider.name, provider.fn, systemPrompt, userPrompt, temperature, 2);
      // If we succeeded with a non-primary, switch to it for future calls
      if (provider.name !== activeProvider) {
        activeProvider = provider.name;
      }
      return result;
    } catch (err) {
      lastError = err;
      console.error(`[LLM] ${provider.name} exhausted all retries:`, err.message);
      // Continue to next provider
    }
  }

  // All providers failed
  throw lastError || new Error("All LLM providers failed");
}

module.exports = { callLLM };
