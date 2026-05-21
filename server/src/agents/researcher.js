const { callLLM } = require("../lib/llm");
const {
  fetchPage,
  extractText,
  webSearch,
  discoverWebsite,
  sleep,
} = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a business research agent. Your job is to produce a structured business profile.

Rules:
- Use your training knowledge of companies combined with any provided scraped data.
- If you recognize the company, provide accurate real-world information (what they do, their industry, size, etc.)
- If you don't recognize the company, use any provided scraped content. If that is also minimal, be honest.
- Be specific and accurate. Provide real information wherever possible.
- Return ONLY valid JSON in this exact shape — no markdown, no explanation, no code blocks:
{
  "companyName": "string",
  "description": "2-3 sentences about what the company actually does",
  "industry": "string (be specific, e.g. Food Delivery, SaaS, Fintech, Healthcare, Legal Services)",
  "sizeSignals": "string (e.g. 'Enterprise, 5000+ employees', '100-500 employees, Series B funded', 'SMB')",
  "digitalPresence": "string (website status, social media presence, app availability, etc.)",
  "existingTools": "string (technologies or platforms they are known to use, or 'Standard business tools' if unknown)",
  "websiteUrl": "string or null"
}

Accuracy is important. Return ONLY the JSON object, nothing else.`;

async function runResearcher(companyName, location = "") {
  const locationStr = location || "India";

  // Step 1: Try to discover company website directly (works even from datacenter IPs)
  let directWebsite = null;
  try {
    directWebsite = await discoverWebsite(companyName);
  } catch { }

  // Step 2: Attempt web search + scraping (may fail from datacenter IPs)
  let combinedText = "";
  const foundLinks = [];
  const fetchedUrls = [];

  try {
    const queries = [
      `${companyName} ${locationStr} company about`,
      `${companyName} official website ${locationStr}`,
    ];

    for (const query of queries) {
      try {
        const links = await webSearch(query, 3);
        for (const link of links) {
          if (!foundLinks.includes(link)) foundLinks.push(link);
        }
      } catch { }
      await sleep(200);
    }

    if (directWebsite && !foundLinks.includes(directWebsite)) {
      foundLinks.unshift(directWebsite);
    }

    // Fetch content from discovered URLs
    for (const link of foundLinks.slice(0, 5)) {
      try {
        const html = await fetchPage(link, 10000);
        const text = extractText(html, 2000);
        if (text.length > 100) {
          combinedText += `Source: ${link}\n${text}\n\n`;
          fetchedUrls.push(link);
        }
      } catch { }
      if (combinedText.length > 5000) break;
      await sleep(100);
    }

    // Try /about page
    const mainSite = directWebsite || foundLinks.find((l) =>
      !l.includes("wikipedia") && !l.includes("linkedin") && !l.includes("tracxn")
    );
    if (mainSite && combinedText.length < 5000) {
      const base = mainSite.replace(/\/$/, "");
      for (const suffix of ["/about", "/about-us", "/company"]) {
        try {
          const aboutUrl = `${base}${suffix}`;
          if (fetchedUrls.includes(aboutUrl)) continue;
          const html = await fetchPage(aboutUrl, 8000);
          const text = extractText(html, 1500);
          if (text.length > 100) {
            combinedText += `Source: ${aboutUrl}\n${text}\n\n`;
            fetchedUrls.push(aboutUrl);
            break;
          }
        } catch { }
      }
    }
  } catch (err) {
    console.error(`[Researcher] Scraping error for "${companyName}":`, err.message);
  }

  // Step 3: LLM analysis — this is the primary method now
  // Even if scraping found nothing, the LLM can use its training knowledge
  const hasScrapedData = combinedText.length > 200;

  const userPrompt = hasScrapedData
    ? `Research task for: "${companyName}"
Location: ${locationStr}
Direct website found: ${directWebsite || "not discovered"}

Below is scraped data. Use this data AND your own knowledge to create an accurate profile.

--- SCRAPED CONTENT START ---
${combinedText.slice(0, 6000)}
--- SCRAPED CONTENT END ---

Return the JSON profile now.`
    : `Research task for: "${companyName}"
Location: ${locationStr}
Direct website found: ${directWebsite || "not discovered"}

Web scraping returned limited results. Please use your training knowledge to create the profile.
If you recognize "${companyName}", provide accurate details about what they do, their industry, size, etc.
If you don't recognize this company, provide your best assessment based on the name and location, and note what is uncertain.

Return the JSON profile now.`;

  try {
    const raw = await callLLM(SYSTEM_PROMPT, userPrompt, 0.2);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in LLM response");
    const profile = JSON.parse(jsonMatch[0]);
    profile.companyName = profile.companyName || companyName;
    if (!profile.websiteUrl) {
      profile.websiteUrl = directWebsite || foundLinks[0] || null;
    }
    return { success: true, data: profile, sourcesChecked: fetchedUrls };
  } catch (err) {
    console.error(`[Researcher] LLM error for "${companyName}":`, err.message);
  }

  // Step 4: If first LLM call failed, try again with simpler prompt
  try {
    const simplePrompt = `Generate a business profile JSON for "${companyName}" in "${locationStr}".
Website: ${directWebsite || "unknown"}
Use your knowledge. Return ONLY valid JSON.`;

    const raw2 = await callLLM(SYSTEM_PROMPT, simplePrompt, 0.2);
    const jsonMatch2 = raw2.match(/\{[\s\S]*\}/);
    if (jsonMatch2) {
      const profile2 = JSON.parse(jsonMatch2[0]);
      profile2.companyName = profile2.companyName || companyName;
      if (!profile2.websiteUrl) {
        profile2.websiteUrl = directWebsite || foundLinks[0] || null;
      }
      return { success: true, data: profile2, sourcesChecked: fetchedUrls };
    }
  } catch (err) {
    console.error(`[Researcher] LLM fallback error for "${companyName}":`, err.message);
  }

  // Step 5: Hard fallback — only reached if ALL LLM calls fail (bad API key)
  return {
    success: true,
    data: {
      companyName,
      description: `${companyName} is a business based in ${locationStr}. Limited information was available from public sources.`,
      industry: "Business Services",
      sizeSignals: "SMB",
      digitalPresence: directWebsite ? `Website: ${directWebsite}` : "Limited online presence",
      existingTools: "Standard business tools",
      websiteUrl: directWebsite || foundLinks[0] || null,
    },
    sourcesChecked: fetchedUrls,
  };
}

module.exports = { runResearcher };
