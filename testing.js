export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);

      // ----- CORS preflight -----
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      // ----- Only GET -----
      if (request.method !== "GET") {
        return withCors(
          jsonObj(
            {
              status: false,
              message: "Method not allowed",
              developer: "Haseeb Sahil",
              channel: "@hsmodzofc2",
            },
            405
          )
        );
      }

      // ----- Only "/" path -----
      if (url.pathname !== "/") {
        return withCors(
          jsonObj(
            {
              status: false,
              message: "Not found. Use only /",
              example: "/?num=03068060398",
              developer: "Haseeb Sahil",
              channel: "@hsmodzofc2",
            },
            404
          )
        );
      }

      // ----- Rate limit (best-effort, in-memory) -----
      // 60 requests per 60 seconds per IP (not 100% accurate across all CF edges, but works without extra files)
      const RATE_LIMIT_MAX = 60;
      const WINDOW_SEC = 60;

      const ip =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
        "unknown";

      const now = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(now / WINDOW_SEC);
      const key = `rl:${ip}:${bucket}`;

      const count = bumpInMemoryRate(key, WINDOW_SEC);
      if (count > RATE_LIMIT_MAX) {
        const retryAfter = (bucket + 1) * WINDOW_SEC - now;
        const res = jsonObj(
          {
            status: false,
            message: "Rate limit exceeded. Try again later.",
            limit: RATE_LIMIT_MAX,
            window_seconds: WINDOW_SEC,
            developer: "Haseeb Sahil",
            channel: "@hsmodzofc2",
          },
          429
        );
        res.headers.set("Retry-After", String(Math.max(1, retryAfter)));
        return withCors(res);
      }

      // ----- Main API -----
      const raw = url.searchParams.get("num") || "";
      const pk = normalizePkNumber(raw);

      if (!pk) {
        return withCors(
          jsonPrettyObj(
            {
              status: false,
              message: "Invalid Pakistani number",
              examples: ["03068060398", "923068060398", "+923068060398"],
              developer: "Haseeb Sahil",
              channel: "@hsmodzofc2",
            },
            400
          )
        );
      }

      const cpn = pk.replace("+", "%2B");

      const upstreamUrl =
        "https://s.callapp.com/callapp-server/csrch" +
        `?cpn=${cpn}` +
        "&myp=fb.877409278562861&ibs=0&cid=0" +
        "&tk=0080528975&cvc=2239";

      const upstreamRes = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 15; wv)",
          "Accept-Encoding": "identity",
          Accept: "application/json",
        },
      });

      if (!upstreamRes.ok) {
        return withCors(
          jsonObj(
            {
              status: false,
              message: "Source API error",
              developer: "Haseeb Sahil",
              channel: "@hsmodzofc2",
            },
            502
          )
        );
      }

      const text = await upstreamRes.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        return withCors(
          jsonObj(
            {
              status: false,
              message: "Source returned non-JSON response",
              developer: "Haseeb Sahil",
              channel: "@hsmodzofc2",
            },
            502
          )
        );
      }

      if (!data) {
        return withCors(
          jsonObj(
            {
              status: false,
              message: "No data found",
              developer: "Haseeb Sahil",
              channel: "@hsmodzofc2",
            },
            404
          )
        );
      }

      const meta = {
        developer: "Haseeb Sahil",
        channel: "@hsmodzofc2",
        source: "hidden",
        normalized: pk,
      };

      if (isPlainObject(data)) {
        return withCors(jsonPrettyObj({ ...data, ...meta }, 200));
      }

      return withCors(
        jsonPrettyObj(
          {
            result: data,
            ...meta,
          },
          200
        )
      );
    } catch {
      return withCors(
        jsonObj(
          {
            status: false,
            message: "Server error",
            developer: "Haseeb Sahil",
            channel: "@hsmodzofc2",
          },
          500
        )
      );
    }
  },
};

// ---------------- Helpers ----------------

function normalizePkNumber(raw) {
  if (raw == null) return null;

  const s = String(raw).trim();
  if (!s) return null;

  const digits = s.replace(/[^\d]/g, "");

  // 030xxxxxxxx (11 digits)
  if (digits.startsWith("03") && digits.length === 11) {
    return "+92" + digits.slice(1);
  }

  // 92xxxxxxxxxx (12 digits)
  if (digits.startsWith("92") && digits.length === 12) {
    return "+" + digits;
  }

  // 3xxxxxxxxx (10 digits)
  if (digits.startsWith("3") && digits.length === 10) {
    return "+92" + digits;
  }

  return null;
}

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response) {
  const h = corsHeaders();
  for (const [k, v] of Object.entries(h)) response.headers.set(k, v);
  return response;
}

function jsonObj(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function jsonPrettyObj(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 4), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// In-memory rate limiting (expires old buckets automatically)
const __mem = new Map(); // key -> {count, exp}
function bumpInMemoryRate(key, windowSec) {
  const now = Math.floor(Date.now() / 1000);

  // cleanup a bit (cheap)
  if (__mem.size > 5000) {
    for (const [k, v] of __mem.entries()) {
      if (v.exp <= now) __mem.delete(k);
    }
  }

  let entry = __mem.get(key);
  if (!entry || entry.exp <= now) {
    entry = { count: 0, exp: now + windowSec + 2 };
  }
  entry.count += 1;
  __mem.set(key, entry);
  return entry.count;
}