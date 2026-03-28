const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callLLM(systemPrompt, userPrompt, temperature = 0.3) {
  const completion = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: 1024,
  });
  return completion.choices[0]?.message?.content || "";
}

module.exports = { callLLM };
