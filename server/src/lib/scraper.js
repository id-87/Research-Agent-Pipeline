const fetch = require("node-fetch");
const cheerio = require("cheerio");

async function fetchPage(url, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    return html;
  } catch {
    return null;
  }
}

function extractText(html, maxLen = 3000) {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript, iframe").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, maxLen);
}

function extractEmails(text) {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(re) || [];
  return [...new Set(found)].filter(
    (e) => !e.includes("example") && !e.includes("domain") && !e.includes("email@")
  );
}

function extractPhones(text) {
  const re =
    /(?:\+91[\s\-]?)?(?:\(?[6-9]\d{9}\)?|(?:\d{2,4}[\s\-]?\d{6,8}))(?!\d)/g;
  const found = text.match(re) || [];
  return [...new Set(found.map((p) => p.trim()))].slice(0, 3);
}

async function googleSearch(query, maxResults = 3) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${encoded}&num=${maxResults + 2}`;
    const html = await fetchPage(url);
    if (!html) return [];
    const $ = cheerio.load(html);
    const links = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const match = href.match(/\/url\?q=([^&]+)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        if (
          decoded.startsWith("http") &&
          !decoded.includes("google.com") &&
          !decoded.includes("youtube.com")
        ) {
          links.push(decoded);
        }
      }
    });
    return [...new Set(links)].slice(0, maxResults);
  } catch {
    return [];
  }
}

module.exports = { fetchPage, extractText, extractEmails, extractPhones, googleSearch };
