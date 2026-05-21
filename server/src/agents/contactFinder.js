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

Given scraped web content or your training knowledge, extract contact details for the business.
Return ONLY valid JSON — no markdown, no explanation, no code blocks:
{
  "phone": "string or null",
  "email": "string or null",
  "whatsapp": "string or null (only if explicitly labelled as WhatsApp)",
  "address": "string or null",
  "sourceUrl": "string or null"
}

Rules:
- Use REAL data found in the content or from your training knowledge.
- DO NOT invent or guess contact info. Only provide contacts you are confident are real.
- If you know the company's real contact info from your training data, provide it.
- For Indian numbers, prefer +91XXXXXXXXXX format.
- If you are not sure about any field, set it to null.
- Return ONLY the JSON object, nothing else.`;

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

  // Step 1: Try scraping contact pages from the company website
  try {
    const urlsToTry = [];

    if (websiteUrl) {
      const base = websiteUrl.replace(/\/$/, "");
      urlsToTry.push(
        `${base}/contact`,
        `${base}/contact-us`,
        `${base}/contactus`,
        `${base}/about`,
        `${base}/about-us`,
        `${base}/company/contact`,
        `${base}/support`,
        websiteUrl
      );
    }

    // Search for contacts
    const searchQueries = [
      `"${companyName}" contact phone email`,
      `${companyName} phone number email address India`,
    ];

    for (const query of searchQueries.slice(0, 2)) {
      try {
        const links = await webSearch(query, 2);
        urlsToTry.push(...links);
      } catch { }
      await sleep(200);
    }

    const uniqueUrls = [...new Set(urlsToTry)].slice(0, 10);

    for (const url of uniqueUrls) {
      try {
        const html = await fetchPage(url, 10000);
        if (!html) continue;

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
          combinedContent += `Source: ${url}\n${text.slice(0, 1000)}\n\n`;
        }

        if (contactData.email && contactData.phone) break;
        await sleep(150);
      } catch { }
    }

    contactData.sourceUrl = foundSource;
  } catch (err) {
    console.error(`[ContactFinder] Scraping error for "${companyName}":`, err.message);
  }

  // Step 2: If we found scraped content, use LLM to refine
  if (combinedContent.length > 100) {
    try {
      const userPrompt = `Extract contact details for "${companyName}" (${industry || "unknown industry"}) from this scraped content.
Only extract contacts that clearly belong to "${companyName}".

${combinedContent.slice(0, 5000)}`;

      const raw = await callLLM(SYSTEM_PROMPT, userPrompt, 0.1);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.phone || parsed.email) {
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

  // Step 3: If regex extraction found contacts, return them
  if (contactData.phone || contactData.email) {
    return {
      success: true,
      data: contactData,
      fallback: false,
    };
  }

  // Step 4: Ask LLM from training knowledge (works even when scraping fails)
  try {
    const knowledgePrompt = `Provide the official contact information for "${companyName}" (${industry || "business"}).
Website: ${websiteUrl || "unknown"}

If you know this company's real contact details from your training data, provide them.
If you don't know their real contact info, return all nulls. Do NOT make up contacts.`;

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
          message: "Contact info from knowledge base",
        };
      }
    }
  } catch (err) {
    console.error(`[ContactFinder] LLM error for "${companyName}":`, err.message);
  }

  // No contact info found
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
    message: "No publicly available contact information found.",
  };
}

module.exports = { runContactFinder };
