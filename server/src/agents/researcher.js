const { callLLM } = require("../lib/llm");
const { fetchPage, extractText, webSearch } = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a business research agent. Your job is to produce a structured business profile.

You will receive whatever web data was found — it may be partial, minimal, or just a company name.
Use your knowledge about the company AND the scraped data to produce the best possible profile.
If you know about the company from your training knowledge, use that information.

Return ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "companyName": "string",
  "description": "2-3 sentences about what the company does",
  "industry": "string (be specific, e.g. Food Delivery, Healthcare SaaS, Legal Services)",
  "sizeSignals": "string (employee range, funding stage, number of offices, or 'SMB' if unknown)",
  "digitalPresence": "string (website exists, active social media, listed on directories, etc.)",
  "existingTools": "string (any CRM, booking system, communication tools, or 'Likely uses standard tools' if unknown)",
  "websiteUrl": "string or null"
}

Never return null for description or industry. Always make a best-effort inference.`;

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

  const userPrompt = `Research this company and return a structured JSON profile.
Use both the scraped data below AND your own knowledge about this company if you recognise it.

${combinedText.slice(0, 5000)}

Company name: ${companyName}
Location: ${locationStr}

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
    const fallbackPrompt = `Based only on the company name "${companyName}" located in "${locationStr}", generate a best-effort business profile JSON. Use your training knowledge if you know this company.`;
    try {
      const raw2 = await callLLM(SYSTEM_PROMPT, fallbackPrompt, 0.3);
      const jsonMatch2 = raw2.match(/\{[\s\S]*\}/);
      if (jsonMatch2) {
        const profile2 = JSON.parse(jsonMatch2[0]);
        profile2.companyName = profile2.companyName || companyName;
        profile2.websiteUrl = profile2.websiteUrl || (foundLinks[0] || null);
        return { success: true, data: profile2, sourcesChecked: foundLinks };
      }
    } catch {}

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
