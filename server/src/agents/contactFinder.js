const { callLLM } = require("../lib/llm");
const {
  fetchPage,
  extractText,
  extractEmails,
  extractEmailsFromHtml,
  extractPhones,
  extractPhonesFromHtml,
  webSearch,
  sleep,
} = require("../lib/scraper");

const SYSTEM_PROMPT = `You are a contact information extraction agent.

Given scraped web content from various sources and company pages, extract contact details for the business.
Return ONLY valid JSON — no markdown, no explanation:
{
  "phone": "string or null",
  "email": "string or null",
  "whatsapp": "string or null (only if explicitly labelled as WhatsApp)",
  "address": "string or null",
  "sourceUrl": "string or null"
}

Rules:
- Only use REAL data found in the provided content. 
- DO NOT invent or guess contact info.
- Ignore placeholder data like "info@company.com" or "123-456-7890" unless they appear to be the actual contact for THIS specific company.
- If multiple phones exist, pick the most prominent business/customer service one.
- For Indian numbers, prefer +91XXXXXXXXXX format.
- If no contact info exists in the content, return all nulls.
- An email like "sales@companyname.com" or "contact@companyname.com" is likely valid.
- Ignore generic email addresses from other companies (e.g. from ad networks or analytics services).`;

async function runContactFinder(profile) {
  const { companyName, websiteUrl, industry } = profile;

  const contactData = {
    phone: null,
    email: null,
    whatsapp: null,
    address: null,
    sourceUrl: null,
  };
  let combinedContent = "";
  let foundSource = null;

  // Step 1: Build list of URLs to check for contacts
  const urlsToTry = [];

  // Try the company website's contact pages
  if (websiteUrl) {
    const base = websiteUrl.replace(/\/$/, "");
    urlsToTry.push(
      `${base}/contact`,
      `${base}/contact-us`,
      `${base}/contactus`,
      `${base}/about`,
      `${base}/about-us`,
      `${base}/company/contact`,
      `${base}/company/contact/`,
      `${base}/support`,
      websiteUrl // homepage as last resort
    );
  }

  // Step 2: Search for contact info via web search
  const searchQueries = [
    `"${companyName}" contact phone email`,
    `${companyName} contact us site:${websiteUrl ? new URL(websiteUrl).hostname : ""}`,
    `${companyName} phone number email address India`,
  ].filter((q) => q.length > 10);

  for (const query of searchQueries.slice(0, 2)) {
    try {
      const links = await webSearch(query, 2);
      urlsToTry.push(...links);
    } catch { }
    await sleep(200);
  }

  // Deduplicate and limit
  const uniqueUrls = [...new Set(urlsToTry)].slice(0, 10);

  // Step 3: Fetch each URL and extract contact info
  for (const url of uniqueUrls) {
    try {
      const html = await fetchPage(url, 10000);
      if (!html) continue;

      // Use HTML-aware extraction (catches mailto: and tel: links)
      const emails = extractEmailsFromHtml(html);
      const phones = extractPhonesFromHtml(html);
      const text = extractText(html, 3000);

      if (emails.length > 0 || phones.length > 0) {
        if (!contactData.email && emails.length > 0) {
          contactData.email = emails[0];
          foundSource = foundSource || url;
        }
        if (!contactData.phone && phones.length > 0) {
          contactData.phone = phones[0];
          foundSource = foundSource || url;
        }
        combinedContent += `Source: ${url}\n${text.slice(0, 1500)}\n\n`;
      } else if (text.length > 100) {
        // Even if no regex matches, the text might contain contact info the LLM can find
        combinedContent += `Source: ${url}\n${text.slice(0, 1000)}\n\n`;
      }

      if (contactData.email && contactData.phone) break;
      await sleep(150);
    } catch { }
  }

  contactData.sourceUrl = foundSource;

  // Step 4: Use LLM to refine contact info if we have scraped content
  if (combinedContent.length > 100) {
    try {
      const userPrompt = `Extract contact details for "${companyName}" (${industry || "unknown industry"}) from this scraped content.
Only extract contacts that clearly belong to "${companyName}".

${combinedContent.slice(0, 5000)}`;

      const raw = await callLLM(SYSTEM_PROMPT, userPrompt, 0.1);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Only use LLM results if they seem reasonable
        if (parsed.phone || parsed.email) {
          parsed.sourceUrl = parsed.sourceUrl || foundSource;
          // Prefer LLM-cleaned results, but fall back to regex results
          return {
            success: true,
            data: {
              phone: parsed.phone || contactData.phone,
              email: parsed.email || contactData.email,
              whatsapp: parsed.whatsapp || null,
              address: parsed.address || null,
              sourceUrl: parsed.sourceUrl || foundSource,
            },
            fallback: false,
          };
        }
      }
    } catch { }
  }

  // Step 5: If regex extraction found something, return it
  if (contactData.phone || contactData.email) {
    return {
      success: true,
      data: contactData,
      fallback: false,
    };
  }

  // Step 6: Last resort — ask LLM from its training knowledge
  try {
    const knowledgePrompt = `Do you know the official contact information for "${companyName}" (${industry || "business"}) in India?
If you have reliable knowledge of their real contact email, phone number, or address from your training data, provide it.
If you don't know their real contact info, return all nulls. Do NOT guess or make up contact information.`;

    const raw2 = await callLLM(SYSTEM_PROMPT, knowledgePrompt, 0.1);
    const jsonMatch2 = raw2.match(/\{[\s\S]*\}/);
    if (jsonMatch2) {
      const parsed2 = JSON.parse(jsonMatch2[0]);
      if (parsed2.phone || parsed2.email) {
        return {
          success: true,
          data: {
            phone: parsed2.phone || null,
            email: parsed2.email || null,
            whatsapp: parsed2.whatsapp || null,
            address: parsed2.address || null,
            sourceUrl: parsed2.sourceUrl || websiteUrl || null,
          },
          fallback: false,
          message: "Contact info from LLM knowledge base",
        };
      }
    }
  } catch { }

  // No contact info found at all
  return {
    success: true,
    data: {
      phone: null,
      email: null,
      whatsapp: null,
      address: null,
      sourceUrl: websiteUrl || null,
    },
    fallback: true,
    message: "No publicly available contact information found across web sources.",
  };
}

module.exports = { runContactFinder };
