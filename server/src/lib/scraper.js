const fetch = require("node-fetch");
const cheerio = require("cheerio");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
];

let uaIndex = 0;
function nextUA() {
  uaIndex = (uaIndex + 1) % USER_AGENTS.length;
  return USER_AGENTS[uaIndex];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Fetch page ──────────────────────────────────────────────────────────────
async function fetchPage(url, timeoutMs = 12000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": nextUA(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
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

// ─── Text extraction ────────────────────────────────────────────────────────
function extractText(html, maxLen = 3000) {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg, img, link, meta, .cookie-banner, .gdpr, .popup").remove();

  const parts = [];

  // Page title
  const title = $("title").text().trim();
  if (title) parts.push(`Title: ${title}`);

  // Meta description
  const metaDesc =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") || "";
  if (metaDesc) parts.push(`Description: ${metaDesc.trim()}`);

  // High-value sections
  const highValue = [];
  $(
    "main, article, .about, .content, .company-info, #about, #content, .hero, .overview, [role='main'], .description, .company-description"
  ).each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 50) highValue.push(t);
  });
  if (highValue.length > 0) {
    parts.push(highValue.join(" ").slice(0, maxLen - 500));
  }

  // Body text
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  parts.push(bodyText);

  return parts.join("\n").slice(0, maxLen);
}

// ─── Email extraction ───────────────────────────────────────────────────────
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
      !e.includes("@3x") &&
      !e.includes(".png") &&
      !e.includes(".jpg") &&
      !e.includes(".svg") &&
      !e.includes(".gif") &&
      !e.includes(".webp") &&
      !e.includes(".woff") &&
      !e.includes("@wix") &&
      !e.includes("@webpack") &&
      !e.includes("noreply") &&
      !e.includes("no-reply") &&
      !e.endsWith(".js") &&
      !e.endsWith(".css") &&
      !e.endsWith(".map") &&
      e.length < 60 &&
      e.length > 5
  );
}

function extractEmailsFromHtml(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const mailtoEmails = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const email = href.replace("mailto:", "").split("?")[0].trim();
    if (email && email.includes("@") && email.length < 60) mailtoEmails.push(email);
  });

  const text = $("body").text();
  const textEmails = extractEmails(text);

  return [...new Set([...mailtoEmails, ...textEmails])];
}

// ─── Phone extraction ───────────────────────────────────────────────────────
function extractPhones(text) {
  const patterns = [
    /\+91[\s\-]?[6-9]\d{4}[\s\-]?\d{5}/g,
    /\+91[\s\-]?[6-9]\d{9}/g,
    /\+91[\s\-]?\d{2,5}[\s\-]?\d{4,8}/g,
    /0[1-9]\d[\s\-]?\d{4}[\s\-]?\d{4}/g,
    /0[6-9]\d{9}/g,
    /0\d{2,4}[\s\-]\d{6,8}/g,
    /(?<!\d)[6-9]\d{9}(?!\d)/g,
    /\+\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,
    /1[\s\-]?800[\s\-]?\d{3}[\s\-]?\d{4}/g,
    /1800[\s\-]?\d{3}[\s\-]?\d{3,4}/g,
  ];
  const found = new Set();
  for (const re of patterns) {
    const matches = text.match(re) || [];
    matches.forEach((m) => {
      const cleaned = m.replace(/[\s\-()]/g, "");
      // Validate: must be 10-15 digits, not all same digit
      if (
        cleaned.length >= 10 &&
        cleaned.length <= 15 &&
        !/^(\d)\1+$/.test(cleaned) // reject all same digit
      ) {
        found.add(m.trim());
      }
    });
    if (found.size >= 5) break;
  }
  return [...found].slice(0, 5);
}

function extractPhonesFromHtml(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const telPhones = [];
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const phone = href.replace("tel:", "").replace(/\s/g, "").trim();
    if (phone && phone.replace(/[^\d]/g, "").length >= 10) telPhones.push(phone);
  });

  const text = $("body").text();
  const textPhones = extractPhones(text);

  return [...new Set([...telPhones, ...textPhones])];
}

// ─── Search: Google ─────────────────────────────────────────────────────────
async function googleSearch(query, maxResults = 5) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${encoded}&num=${maxResults + 5}&hl=en`;
    const html = await fetchPage(url, 12000);
    if (!html) return [];

    const $ = cheerio.load(html);
    const links = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";

      if (href.startsWith("http") && !href.includes("google.com") && !href.includes("googleapis.com")) {
        links.push(href);
        return;
      }

      if (href.startsWith("/url?")) {
        const params = new URLSearchParams(href.slice(5));
        const real = params.get("q");
        if (real && real.startsWith("http") && !real.includes("google.com")) {
          links.push(real);
        }
      }
    });

    return filterSearchResults(links, maxResults);
  } catch (err) {
    console.error("[Search] Google error:", err.message);
    return [];
  }
}

// ─── Search: Bing ───────────────────────────────────────────────────────────
async function bingSearch(query, maxResults = 5) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.bing.com/search?q=${encoded}&count=${maxResults + 5}`;
    const html = await fetchPage(url, 12000);
    if (!html) return [];

    const $ = cheerio.load(html);
    const links = [];

    $("li.b_algo a, .b_algo h2 a, .b_title a").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.startsWith("http") && !href.includes("bing.com") && !href.includes("microsoft.com")) {
        links.push(href);
      }
    });

    if (links.length === 0) {
      $("cite").each((_, el) => {
        const text = $(el).text().trim();
        if (text.startsWith("http")) links.push(text);
        else if (text.includes(".")) links.push(`https://${text.split(" ")[0]}`);
      });
    }

    return filterSearchResults(links, maxResults);
  } catch (err) {
    console.error("[Search] Bing error:", err.message);
    return [];
  }
}

// ─── Search: DuckDuckGo ─────────────────────────────────────────────────────
async function duckDuckGoSearch(query, maxResults = 5) {
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
        if (href.includes("uddg=")) {
          const params = new URLSearchParams(href.split("?")[1] || "");
          const uddg = params.get("uddg");
          if (uddg && uddg.startsWith("http")) links.push(decodeURIComponent(uddg));
        }
      });
    }

    return filterSearchResults(links, maxResults);
  } catch (err) {
    console.error("[Search] DDG error:", err.message);
    return [];
  }
}

// ─── Shared filter for search results ───────────────────────────────────────
function filterSearchResults(links, maxResults) {
  return [...new Set(links)]
    .filter(
      (l) =>
        l.startsWith("http") &&
        !l.includes("google.com") &&
        !l.includes("googleapis.com") &&
        !l.includes("bing.com") &&
        !l.includes("microsoft.com") &&
        !l.includes("duckduckgo.com") &&
        !l.includes("youtube.com") &&
        !l.includes("facebook.com") &&
        !l.includes("twitter.com") &&
        !l.includes("instagram.com") &&
        !l.includes("accounts.google") &&
        !l.includes("maps.google") &&
        !l.includes("support.google") &&
        !l.includes("play.google.com") &&
        !l.includes("apps.apple.com")
    )
    .slice(0, maxResults);
}

// ─── Direct website discovery ───────────────────────────────────────────────
async function discoverWebsite(companyName) {
  const clean = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!clean || clean.length < 2) return null;

  // Also try with spaces replaced by nothing (multi-word names)
  const multiWord = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/);
  
  const candidates = [
    `https://www.${clean}.com`,
    `https://${clean}.com`,
    `https://www.${clean}.in`,
    `https://${clean}.in`,
    `https://www.${clean}.io`,
    `https://${clean}.co.in`,
    `https://www.${clean}.co`,
  ];

  // For multi-word names, also try hyphenated versions
  if (multiWord.length > 1) {
    const hyphenated = multiWord.join("-");
    candidates.push(`https://www.${hyphenated}.com`);
    candidates.push(`https://${hyphenated}.com`);
    candidates.push(`https://www.${hyphenated}.in`);
  }

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        headers: { "User-Agent": nextUA() },
        redirect: "follow",
      });
      clearTimeout(timer);
      if (res.ok || res.status === 301 || res.status === 302) {
        return res.url || url;
      }
    } catch {
      // Ignore, try next
    }
  }

  return null;
}

// ─── Combined web search (rotating engines) ─────────────────────────────────
// We rotate which engine goes first to distribute load
let searchRotation = 0;

async function webSearch(query, maxResults = 4) {
  const engines = [
    { name: "Google", fn: googleSearch },
    { name: "Bing", fn: bingSearch },
    { name: "DDG", fn: duckDuckGoSearch },
  ];

  // Rotate starting engine
  const startIdx = searchRotation % engines.length;
  searchRotation++;

  const orderedEngines = [
    engines[startIdx],
    engines[(startIdx + 1) % engines.length],
    engines[(startIdx + 2) % engines.length],
  ];

  let allLinks = [];

  for (const engine of orderedEngines) {
    try {
      const links = await engine.fn(query, maxResults);
      if (links.length > 0) {
        allLinks = [...new Set([...allLinks, ...links])];
        if (allLinks.length >= maxResults) {
          return allLinks.slice(0, maxResults);
        }
      }
    } catch { }
    await sleep(400); // Delay between engines
  }

  return allLinks.slice(0, maxResults);
}

module.exports = {
  fetchPage,
  extractText,
  extractEmails,
  extractEmailsFromHtml,
  extractPhones,
  extractPhonesFromHtml,
  webSearch,
  discoverWebsite,
  sleep,
};
