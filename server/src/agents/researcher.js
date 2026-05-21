const { callLLM } = require("../lib/llm");
const { fetchPage, extractText, webSearch } = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a business research agent. Your job is to produce a structured business profile based ONLY on the provided scraped content from DuckDuckGo and other sources.

Rules:
- Prioritize facts from the provided text over your general training knowledge.
- If the scraped text is minimal or irrelevant, DO NOT invent specific details (like specific services or tools).
- Use "Unknown" or "General [Industry] services" if you are not sure.
- Return ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "companyName": "string",
  "description": "2-3 sentences about what the company does",
  "industry": "string (be specific, e.g. Food Delivery, Healthcare SaaS, Legal Services)",
  "sizeSignals": "string (employee range, funding stage, or 'SMB' if unknown)",
  "digitalPresence": "string (website exists, active social media, listed on directories, etc.)",
  "existingTools": "string (specific tools found, or 'Standard business tools' if unknown)",
  "websiteUrl": "string or null"
}

Accuracy is more important than being exhaustive. If you cannot find something, state it is unknown.`;

async function runResearcher(companyName, location = "") {
  const locationStr = location || "India";
  const queries = [
    `${companyName} ${locationStr} company`,
    `${companyName} ${locationStr} business contact`,
  ];

  let combinedText = `Company: ${companyName}\nLocation: ${locationStr}\n\n`;
  const foundLinks = [];

  for (const query of queries) {
    const links = await webSearch(query, 3);
    for (const link of links) {
      if (foundLinks.includes(link)) continue;
      foundLinks.push(link);
      const html = await fetchPage(link, 8000);
      const text = extractText(html, 1500);
      if (text.length > 150) {
        combinedText += `Source: ${link}\n${text}\n\n`;
      }
      if (combinedText.length > 5000) break;
    }
    if (foundLinks.length >= 4) break;
  }

  const userPrompt = `Research task for: "${companyName}"
Location: ${locationStr}

Below is the scraped data found via DuckDuckGo. If the data describes a different company, ignore it.
If the data is empty, mention that limited information was available.

--- SCRAPED CONTENT START ---
${combinedText.slice(0, 5000)}
--- SCRAPED CONTENT END ---

Return the JSON profile now.`;

  try {
    const raw = await callLLM(SYSTEM_PROMPT, userPrompt, 0.2);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const profile = JSON.parse(jsonMatch[0]);
    profile.companyName = profile.companyName || companyName;
    if (!profile.websiteUrl && foundLinks.length > 0) {
      profile.websiteUrl = foundLinks[0];
    }
    return { success: true, data: profile, sourcesChecked: foundLinks };
  } catch {
    const fallbackPrompt = `Generate a very conservative business profile for "${companyName}" in "${locationStr}". 
If you recognize this EXACT company name from your training data, use that. 
Otherwise, only provide general industry information and mark everything else as "Information not available".`;
    try {
      const raw2 = await callLLM(SYSTEM_PROMPT, fallbackPrompt, 0.1);
      const jsonMatch2 = raw2.match(/\{[\s\S]*\}/);
      if (jsonMatch2) {
        const profile2 = JSON.parse(jsonMatch2[0]);
        profile2.companyName = profile2.companyName || companyName;
        profile2.websiteUrl = profile2.websiteUrl || (foundLinks[0] || null);
        return { success: true, data: profile2, sourcesChecked: foundLinks };
      }
    } catch { }

    return {
      success: true,
      data: {
        companyName,
        description: `${companyName} is a business based in ${locationStr}. Further details could not be retrieved from public sources.`,
        industry: "Business Services",
        sizeSignals: "SMB",
        digitalPresence: foundLinks.length > 0 ? "Has web presence" : "Limited online presence",
        existingTools: "Likely uses standard business tools",
        websiteUrl: foundLinks[0] || null,
      },
      sourcesChecked: foundLinks,
    };
  }
}

module.exports = { runResearcher };
