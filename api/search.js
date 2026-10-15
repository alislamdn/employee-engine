const rateLimits = new Map();
const MAX_REQUESTS_PER_MINUTE = 30;

function isRateLimited(request) {
  const forwardedFor = request.headers["x-forwarded-for"] || "unknown";
  const clientIp = forwardedFor.split(",")[0].trim();
  const now = Date.now();
  const record = rateLimits.get(clientIp);

  if (!record || now - record.startedAt >= 60_000) {
    rateLimits.set(clientIp, { startedAt: now, count: 1 });
    return false;
  }

  record.count += 1;
  return record.count > MAX_REQUESTS_PER_MINUTE;
}

function normalizeResult(result, url, snippet, source) {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return {
      title: String(result || "Search result").slice(0, 300),
      url: parsed.href,
      snippet: String(snippet || "").slice(0, 1200),
      source: String(source || parsed.hostname).slice(0, 200)
    };
  } catch {
    return null;
  }
}

async function googleSearch(query) {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const engineId = process.env.GOOGLE_CSE_ENGINE_ID;
  if (!apiKey || !engineId) {
    const error = new Error("Google search is not set up yet. Add GOOGLE_CSE_API_KEY and GOOGLE_CSE_ENGINE_ID in Vercel Project Settings → Environment Variables.");
    error.statusCode = 503;
    throw error;
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", query);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Google could not complete this search. Check the Google API key and search engine ID in Vercel.");
  const payload = await response.json();
  return (payload.items || []).map(item => normalizeResult(item.title, item.link, item.snippet, item.displayLink)).filter(Boolean);
}

async function braveSearch(query) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    const error = new Error("Brave Search is not set up yet. Add BRAVE_SEARCH_API_KEY in Vercel Project Settings → Environment Variables.");
    error.statusCode = 503;
    throw error;
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  const response = await fetch(url, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Brave could not complete this search. Check the Brave API key in Vercel.");
  const payload = await response.json();
  return (payload.web?.results || []).map(item => normalizeResult(item.title, item.url, item.description, item.profile?.long_name)).filter(Boolean);
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") return response.status(405).json({ error: "Use GET to search." });

  const query = typeof request.query?.q === "string" ? request.query.q.trim() : "";
  const provider = typeof request.query?.provider === "string" ? request.query.provider : "";
  if (!query || query.length > 200) return response.status(400).json({ error: "Enter a search up to 200 characters." });
  if (!["google", "brave"].includes(provider)) return response.status(400).json({ error: "Choose Google Custom Search or Brave Search." });
  if (isRateLimited(request)) return response.status(429).json({ error: "Too many searches from this connection. Try again in a minute." });

  try {
    const results = provider === "google" ? await googleSearch(query) : await braveSearch(query);
    return response.status(200).json({ provider, results: results.slice(0, 10) });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "TimeoutError" ? 504 : 502);
    const message = error.statusCode ? error.message : error.name === "TimeoutError" ? "Search took too long. Please try again." : error.message;
    return response.status(statusCode).json({ error: message || "Search is temporarily unavailable." });
  }
};