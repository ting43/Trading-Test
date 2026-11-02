// Vercel 伺服器函式：代抓富果行情
// 金鑰（FUGLE_API_KEY）與登入密碼（APP_PASSWORD）都只從環境變數讀取
import { timingSafeEqual, createHash } from "node:crypto";

const CACHE_MS = 4000;          // 同一檔股票 4 秒內共用同一次查詢
const IP_LIMIT = 30;            // 每個來源每分鐘最多 30 次
const FAIL_LIMIT = 5;           // 每個來源每 10 分鐘最多錯 5 次密碼
const cache = new Map();        // symbol -> { at, status, body }
const hits = new Map();         // ip -> { start, count }
const fails = new Map();        // ip -> { start, count }

function over(map, ip, windowMs, limit, add = true) {
  const now = Date.now();
  let h = map.get(ip);
  if (!h || now - h.start > windowMs) { h = { start: now, count: 0 }; map.set(ip, h); }
  if (add) h.count += 1;
  return h.count > limit;
}

function samePassword(given, expected) {
  const a = createHash("sha256").update(String(given)).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  // 回應內容只給通過密碼的人，不能讓 CDN 共用快取
  res.setHeader("Cache-Control", "no-store");

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(500).json({ error: "no_password_config" });

  if (over(fails, ip, 10 * 60000, FAIL_LIMIT, false)) {
    return res.status(429).json({ error: "too_many_wrong_passwords" });
  }
  const given = req.headers["x-app-password"];
  if (!given || !samePassword(given, expected)) {
    over(fails, ip, 10 * 60000, FAIL_LIMIT, true);
    return res.status(401).json({ error: "unauthorized" });
  }

  const symbol = String(req.query.symbol || "2330");
  if (!/^\d{4,6}$/.test(symbol)) return res.status(400).json({ error: "bad_symbol" });

  if (over(hits, ip, 60000, IP_LIMIT)) return res.status(429).json({ error: "rate_limit" });

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
  return res.status(status).json(body);
}
