const { callLLM } = require("../lib/llm");
const { fetchPage, extractText, googleSearch } = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a business research agent. Given raw web content about a company, extract a structured business profile.

Return ONLY valid JSON in this exact shape:
{
  "companyName": "string",
  "description": "string (2-3 sentences about what the company does)",
  "industry": "string",
  "sizeSignals": "string (employee count hints, office locations, scale indicators)",
  "digitalPresence": "string (website quality, social media, online listings)",
  "existingTools": "string (any CRM, booking, communication tools mentioned)",
  "websiteUrl": "string or null"
}

Be factual. If data is missing, use "Not found" for that field. No markdown, no explanation, only JSON.`;

async function runResearcher(companyName, location = "") {
  const query = location
    ? `${companyName} ${location} company business`
    : `${companyName} company business India`;

  let combinedText = `Company: ${companyName}\nLocation: ${location || "India"}\n\n`;

  const links = await googleSearch(query, 3);

  for (const link of links) {
    const html = await fetchPage(link);
    const text = extractText(html, 1500);
    if (text.length > 200) {
      combinedText += `Source: ${link}\n${text}\n\n`;
    }
  }

  if (combinedText.length < 300) {
    combinedText += `No detailed web data found for ${companyName}. Generate best-effort profile based on company name.`;
  }

  const userPrompt = `Research this company and return a structured JSON profile:\n\n${combinedText}`;

  try {
    const raw = await callLLM(SYSTEM_PROMPT, userPrompt, 0.2);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");
    const profile = JSON.parse(jsonMatch[0]);
    profile.companyName = profile.companyName || companyName;
    profile.websiteUrl = profile.websiteUrl || (links[0] || null);
    return { success: true, data: profile, sourcesChecked: links };
  } catch (err) {
    return {
      success: true,
      data: {
        companyName,
        description: "Could not extract detailed profile from available web sources.",
        industry: "Unknown",
        sizeSignals: "Not found",
        digitalPresence: links.length > 0 ? "Has web presence" : "Limited online presence",
        existingTools: "Not found",
        websiteUrl: links[0] || null,
      },
      sourcesChecked: links,
    };
  }
}

module.exports = { runResearcher };
