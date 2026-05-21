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

// ─── Main callLLM function (with fallback) ───────────────────────────────────
async function callLLM(systemPrompt, userPrompt, temperature = 0.3) {
  initProviders();

  if (activeProvider === "none") {
    throw new Error("No LLM provider configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env");
  }

  // Try the active provider first
  try {
    if (activeProvider === "groq") {
      return await callGroq(systemPrompt, userPrompt, temperature);
    } else if (activeProvider === "gemini") {
      return await callGemini(systemPrompt, userPrompt, temperature);
    }
  } catch (err) {
    console.error(`[LLM] ${activeProvider} failed:`, err.message);

    // If primary fails, try the other provider
    if (activeProvider === "groq" && geminiClient) {
      console.log("[LLM] Falling back to Gemini...");
      activeProvider = "gemini"; // Switch for future calls too
      return await callGemini(systemPrompt, userPrompt, temperature);
    }
    if (activeProvider === "gemini" && groqClient) {
      console.log("[LLM] Falling back to Groq...");
      activeProvider = "groq";
      return await callGroq(systemPrompt, userPrompt, temperature);
    }

    // No fallback available
    throw err;
  }
}

module.exports = { callLLM };
