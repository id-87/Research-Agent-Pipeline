const { callLLM } = require("../lib/llm");
const { fetchPage, extractText, extractEmails, extractPhones, googleSearch } = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a contact information extraction agent. Given scraped web content, extract contact details.

Return ONLY valid JSON in this exact shape:
{
  "phone": "string or null",
  "email": "string or null",
  "whatsapp": "string or null (only if explicitly mentioned as WhatsApp)",
  "address": "string or null",
  "sourceUrl": "string or null"
}

Rules:
- Use real data found in the content only. Do not invent contact info.
- If multiple phones exist, pick the most prominent one.
- For Indian numbers, format as +91XXXXXXXXXX if possible.
- No markdown, no explanation, only JSON.`;

async function runContactFinder(profile) {
  const { companyName, websiteUrl, industry } = profile;

  const contactData = {
    phone: null,
    email: null,
    whatsapp: null,
    address: null,
    sourceUrl: null,
  };

  const urlsToCheck = [];
  if (websiteUrl) urlsToCheck.push(websiteUrl);

  const queries = [
    `${companyName} contact phone email`,
    `${companyName} India contact number`,
    `"${companyName}" site:indiamart.com OR site:justdial.com OR site:sulekha.com`,
  ];

  for (const q of queries) {
    const links = await googleSearch(q, 2);
    urlsToCheck.push(...links);
  }

  const uniqueUrls = [...new Set(urlsToCheck)].slice(0, 5);
  let combinedContent = "";
  let foundSource = null;

  for (const url of uniqueUrls) {
    const html = await fetchPage(url);
    if (!html) continue;
    const text = extractText(html, 2000);

    const emails = extractEmails(text);
    const phones = extractPhones(text);

    if (emails.length > 0 || phones.length > 0) {
      if (!contactData.email && emails.length > 0) {
        contactData.email = emails[0];
        foundSource = url;
      }
      if (!contactData.phone && phones.length > 0) {
        contactData.phone = phones[0];
        if (!foundSource) foundSource = url;
      }
      combinedContent += `Source: ${url}\n${text}\n\n`;
    }

    if (contactData.email && contactData.phone) break;
  }

  contactData.sourceUrl = foundSource;

  if (!contactData.email && !contactData.phone && combinedContent.length === 0) {
    return {
      success: true,
      data: {
        phone: null,
        email: null,
        whatsapp: null,
        address: null,
        sourceUrl: null,
      },
      fallback: true,
      message: "No publicly available contact information found.",
    };
  }

  if (combinedContent.length > 100) {
    try {
      const userPrompt = `Extract contact info from this web content for ${companyName}:\n\n${combinedContent.slice(0, 4000)}`;
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
    fallback: !contactData.phone && !contactData.email,
    message: !contactData.phone && !contactData.email
      ? "No publicly available contact information found."
      : undefined,
  };
}

module.exports = { runContactFinder };
