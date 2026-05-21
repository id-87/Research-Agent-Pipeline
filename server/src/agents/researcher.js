const { callLLM } = require("../lib/llm");
const {
  fetchPage,
  extractText,
  webSearch,
  discoverWebsite,
  sleep,
} = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a business research agent. Your job is to produce a structured business profile based on the provided scraped content AND your own training knowledge of well-known companies.

Rules:
- Combine facts from the scraped content WITH your knowledge of the company.
- If the company is well-known (e.g. Zomato, Freshworks, Razorpay, Swiggy, PhonePe, Ola, TCS, Infosys, Flipkart, etc.), use your training data to supplement scraped content.
- For lesser-known companies, rely primarily on scraped content but still provide what you can from training data.
- Be specific and accurate. Provide real information wherever possible.
- Return ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "companyName": "string",
  "description": "2-3 sentences about what the company actually does",
  "industry": "string (be specific, e.g. Food Delivery, SaaS, Fintech, Healthcare, Legal Services)",
  "sizeSignals": "string (e.g. 'Enterprise, 5000+ employees', '100-500 employees, Series B funded', 'SMB')",
  "digitalPresence": "string (website status, social media presence, app availability, etc.)",
  "existingTools": "string (technologies or platforms they are known to use, or 'Standard business tools' if unknown)",
  "websiteUrl": "string or null"
}

Accuracy is important. If you genuinely recognize the company, provide accurate details. If you don't know the company at all, use the scraped data. If even that is minimal, be honest and conservative.`;

async function runResearcher(companyName, location = "") {
  const locationStr = location || "India";

  // Step 1: Try to discover company website directly
  let directWebsite = null;
  try {
    directWebsite = await discoverWebsite(companyName);
  } catch { }

  // Step 2: Run web search for company info
  const queries = [
    `${companyName} ${locationStr} company about`,
    `${companyName} official website ${locationStr}`,
  ];

  let combinedText = `Company: ${companyName}\nLocation: ${locationStr}\n\n`;
  const foundLinks = [];

  for (const query of queries) {
    try {
      const links = await webSearch(query, 3);
      for (const link of links) {
        if (foundLinks.includes(link)) continue;
        foundLinks.push(link);
      }
    } catch (err) {
      console.error(`Search error for "${query}":`, err.message);
    }
    await sleep(200);
  }

  // Add direct website to the list if found
  if (directWebsite && !foundLinks.includes(directWebsite)) {
    foundLinks.unshift(directWebsite);
  }

  // Step 3: Fetch and extract content from discovered URLs
  const fetchedUrls = [];
  for (const link of foundLinks.slice(0, 6)) {
    try {
      const html = await fetchPage(link, 10000);
      const text = extractText(html, 2000);
      if (text.length > 100) {
        combinedText += `Source: ${link}\n${text}\n\n`;
        fetchedUrls.push(link);
      }
    } catch { }

    if (combinedText.length > 6000) break;
    await sleep(100);
  }

  // Also try /about page of the main website
  const mainSite = directWebsite || foundLinks.find((l) => {
    const lower = l.toLowerCase();
    return !lower.includes("wikipedia") && !lower.includes("linkedin") && !lower.includes("tracxn");
  });

  if (mainSite) {
    const base = mainSite.replace(/\/$/, "");
    for (const suffix of ["/about", "/about-us", "/company"]) {
      if (combinedText.length > 7000) break;
      try {
        const aboutUrl = `${base}${suffix}`;
        if (fetchedUrls.includes(aboutUrl)) continue;
        const html = await fetchPage(aboutUrl, 8000);
        const text = extractText(html, 1500);
        if (text.length > 100) {
          combinedText += `Source: ${aboutUrl}\n${text}\n\n`;
          fetchedUrls.push(aboutUrl);
          break; // Found an about page, stop
        }
      } catch { }
    }
  }

  // Step 4: LLM analysis
  const userPrompt = `Research task for: "${companyName}"
Location: ${locationStr}
Direct website found: ${directWebsite || "not discovered"}

Below is the scraped data from web searches. Use this data AND your own knowledge of this company (if any) to create the profile.

--- SCRAPED CONTENT START ---
${combinedText.slice(0, 7000)}
--- SCRAPED CONTENT END ---

Return the JSON profile now. Be specific and provide real company information.`;

  try {
    const raw = await callLLM(SYSTEM_PROMPT, userPrompt, 0.2);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in LLM response");
    const profile = JSON.parse(jsonMatch[0]);
    profile.companyName = profile.companyName || companyName;
    if (!profile.websiteUrl) {
      profile.websiteUrl = directWebsite || mainSite || foundLinks[0] || null;
    }
    return { success: true, data: profile, sourcesChecked: fetchedUrls };
  } catch (err) {
    console.error(`Researcher LLM error for "${companyName}":`, err.message);

    // Fallback: Ask LLM to use its training knowledge
    const fallbackPrompt = `Generate a business profile for "${companyName}" based in "${locationStr}". 
Use your training data knowledge. If you know this company, provide accurate details.
If you don't recognize this company at all, provide what you can infer from the name and location, and clearly indicate what is uncertain.
Website found via probe: ${directWebsite || "none"}

Return only valid JSON in the specified format.`;

    try {
      const raw2 = await callLLM(SYSTEM_PROMPT, fallbackPrompt, 0.2);
      const jsonMatch2 = raw2.match(/\{[\s\S]*\}/);
      if (jsonMatch2) {
        const profile2 = JSON.parse(jsonMatch2[0]);
        profile2.companyName = profile2.companyName || companyName;
        if (!profile2.websiteUrl) {
          profile2.websiteUrl = directWebsite || foundLinks[0] || null;
        }
        return { success: true, data: profile2, sourcesChecked: fetchedUrls };
      }
    } catch { }

    // Hard fallback
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
}

module.exports = { runResearcher };
