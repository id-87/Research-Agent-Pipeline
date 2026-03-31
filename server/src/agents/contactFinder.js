const { callLLM } = require("../lib/llm");
const { fetchPage, extractText, extractEmails, extractPhones, webSearch } = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a contact information extraction agent.

Given scraped web content, extract contact details for the business.
Return ONLY valid JSON — no markdown, no explanation:
{
  "phone": "string or null",
  "email": "string or null",
  "whatsapp": "string or null (only if explicitly labelled as WhatsApp)",
  "address": "string or null",
  "sourceUrl": "string or null"
}

Rules:
- Only use real data found in the content. Do not invent contact info.
- If multiple phones exist, pick the most prominent one.
- For Indian numbers, prefer +91XXXXXXXXXX format.
- If no contact info exists in the content, return all nulls.`;

async function runContactFinder(profile) {
  const { companyName, websiteUrl, industry } = profile;

  const contactData = { phone: null, email: null, whatsapp: null, address: null, sourceUrl: null };
  let combinedContent = "";
  let foundSource = null;

  const urlsToTry = [];
  if (websiteUrl) {
    urlsToTry.push(websiteUrl);
    const base = websiteUrl.replace(/\/$/, "");
    urlsToTry.push(`${base}/contact`);
    urlsToTry.push(`${base}/contact-us`);
    urlsToTry.push(`${base}/about`);
  }

  const searchQueries = [
    `${companyName} contact phone email India`,
    `"${companyName}" phone number email address`,
    `${companyName} justdial OR indiamart OR sulekha contact`,
  ];

  for (const query of searchQueries) {
    const links = await webSearch(query, 2);
    urlsToTry.push(...links);
  }

  const uniqueUrls = [...new Set(urlsToTry)].slice(0, 7);

  for (const url of uniqueUrls) {
    const html = await fetchPage(url, 8000);
    if (!html) continue;
    const text = extractText(html, 2500);

    const emails = extractEmails(text);
    const phones = extractPhones(text);

    if (emails.length > 0 || phones.length > 0) {
      if (!contactData.email && emails.length > 0) {
        contactData.email = emails[0];
        foundSource = foundSource || url;
      }
      if (!contactData.phone && phones.length > 0) {
        contactData.phone = phones[0];
        foundSource = foundSource || url;
      }
      combinedContent += `Source: ${url}\n${text.slice(0, 1000)}\n\n`;
    }

    if (contactData.email && contactData.phone) break;
  }

  contactData.sourceUrl = foundSource;

  if (!contactData.phone && !contactData.email) {
    return {
      success: true,
      data: { phone: null, email: null, whatsapp: null, address: null, sourceUrl: null },
      fallback: true,
      message: "No publicly available contact information found across web sources.",
    };
  }

  if (combinedContent.length > 100) {
    try {
      const userPrompt = `Extract contact details for "${companyName}" from this scraped content:\n\n${combinedContent.slice(0, 4000)}`;
      const raw = await callLLM(SYSTEM_PROMPT, userPrompt, 0.1);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.phone || parsed.email) {
          parsed.sourceUrl = parsed.sourceUrl || foundSource;
          return { success: true, data: parsed, fallback: false };
        }
      }
    } catch {}
  }

  return {
    success: true,
    data: contactData,
    fallback: false,
  };
}

module.exports = { runContactFinder };
