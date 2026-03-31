const fetch = require("node-fetch");
const cheerio = require("cheerio");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchPage(url, timeoutMs = 10000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": randomUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractText(html, maxLen = 3000) {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript, iframe, svg, img").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.slice(0, maxLen);
}

function extractEmails(text) {
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(re) || [];
  return [...new Set(found)].filter(
    (e) =>
      !e.includes("example") &&
      !e.includes("domain") &&
      !e.includes("email@") &&
      !e.includes("@sentry") &&
      !e.includes("@2x") &&
      !e.includes(".png") &&
      !e.includes(".jpg") &&
      e.length < 60
  );
}

function extractPhones(text) {
  const patterns = [
    /\+91[\s\-]?[6-9]\d{9}/g,
    /0[6-9]\d{9}/g,
    /[6-9]\d{9}/g,
    /\d{3,5}[\s\-]\d{6,8}/g,
  ];
  const found = new Set();
  for (const re of patterns) {
    const matches = text.match(re) || [];
    matches.forEach((m) => found.add(m.trim()));
    if (found.size >= 3) break;
  }
  return [...found].slice(0, 3);
}

async function duckDuckGoSearch(query, maxResults = 4) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const html = await fetchPage(url, 12000);
    if (!html) return [];

    const $ = cheerio.load(html);
    const links = [];

    $("a.result__a").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.startsWith("http") && !href.includes("duckduckgo.com")) {
        links.push(href);
      }
    });

    if (links.length === 0) {
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        const uddg = new URLSearchParams(href.split("?")[1] || "").get("uddg");
        if (uddg && uddg.startsWith("http")) links.push(decodeURIComponent(uddg));
      });
    }

    return [...new Set(links)]
      .filter(
        (l) =>
          !l.includes("duckduckgo.com") &&
          !l.includes("youtube.com") &&
          !l.includes("facebook.com") &&
          !l.includes("twitter.com") &&
          !l.includes("instagram.com")
      )
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

async function bingSearch(query, maxResults = 3) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.bing.com/search?q=${encoded}&count=${maxResults + 2}`;
    const html = await fetchPage(url, 10000);
    if (!html) return [];

    const $ = cheerio.load(html);
    const links = [];

    $("li.b_algo h2 a").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.startsWith("http") && !href.includes("bing.com") && !href.includes("microsoft.com")) {
        links.push(href);
      }
    });

    return [...new Set(links)].slice(0, maxResults);
  } catch {
    return [];
  }
}

async function webSearch(query, maxResults = 4) {
  let results = await duckDuckGoSearch(query, maxResults);
  if (results.length === 0) {
    results = await bingSearch(query, maxResults);
  }
  return results;
}

module.exports = { fetchPage, extractText, extractEmails, extractPhones, webSearch };
