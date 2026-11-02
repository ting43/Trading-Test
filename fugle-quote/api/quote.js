// Vercel 伺服器函式：代抓富果行情，金鑰只從環境變數讀取
const CACHE_MS = 4000;          // 同一檔股票 4 秒內共用同一次查詢
const IP_LIMIT = 30;            // 每個來源每分鐘最多 30 次
const cache = new Map();        // symbol -> { at, status, body }
const hits = new Map();         // ip -> { start, count }

function tooMany(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > 60000) { hits.set(ip, { start: now, count: 1 }); return false; }
  h.count += 1;
  return h.count > IP_LIMIT;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=4, stale-while-revalidate=1");

  const symbol = String(req.query.symbol || "2330");
  if (!/^\d{4,6}$/.test(symbol)) return res.status(400).json({ error: "bad_symbol" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(429).json({ error: "rate_limit" });
  }

  const c = cache.get(symbol);
  if (c && Date.now() - c.at < CACHE_MS) return res.status(c.status).json(c.body);

  const key = process.env.FUGLE_API_KEY;
  if (!key) return res.status(500).json({ error: "no_key" });

  let status, body;
  try {
    const r = await fetch(
      `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${symbol}`,
      { headers: { "X-API-KEY": key } }
    );
    if (r.status === 429) { status = 429; body = { error: "rate_limit" }; }
    else if (r.status === 404 || r.status === 400) { status = 404; body = { error: "not_found" }; }
    else if (!r.ok) { status = 502; body = { error: "upstream", status: r.status }; }
    else {
      const d = await r.json();
      status = 200;
      body = {
        symbol,
        name: d.name ?? null,
        lastPrice: d.lastPrice ?? null,
        tradeVolume: d.total?.tradeVolume ?? null,
        lastUpdated: d.lastUpdated ?? null
      };
    }
  } catch (e) {
    status = 502; body = { error: "fetch_failed" };
  }

  if (status === 200 || status === 404) cache.set(symbol, { at: Date.now(), status, body });
  if (status !== 200 && status !== 404) res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}
