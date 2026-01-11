export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Only GET supported (same as your Flask GET "/")
      if (request.method !== "GET") {
        return json(
          { status: false, message: "Method not allowed", developer: "abbas" },
          405
        );
      }

      // Optional: allow root path only; otherwise still handle all paths like Vercel routes did
      // (Your vercel.json routed everything to app.py)
      // We'll just behave same: accept any path.
      const raw = url.searchParams.get("num") || "";
      const pk = normalizePkNumber(raw);

      if (!pk) {
        return json(
          {
            status: false,
            message: "Invalid Pakistani number",
            examples: ["03068060398", "923068060398", "+923068060398"],
            developer: "abbas",
          },
          400
        );
      }

      // CallApp expects URL-encoded plus
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
        // Cloudflare will enforce HTTPS certificate validity (no verify=false here)
      });

      if (!upstreamRes.ok) {
        return json(
          {
            status: false,
            message: "Source API error",
            developer: "abbas",
          },
          502
        );
      }

      const text = await upstreamRes.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return json(
          {
            status: false,
            message: "Source returned non-JSON response",
            developer: "abbas",
          },
          502
        );
      }

      if (!data) {
        return json(
          { status: false, message: "No data found", developer: "abbas" },
          404
        );
      }

      // Add your fields (same as Flask)
      if (isPlainObject(data)) {
        data.developer = "abbas";
        data.source = "hidden";
        data.normalized = pk;
        // Pretty JSON output like indent=4
        return jsonPretty(data, 200);
      } else {
        const wrapped = {
          result: data,
          developer: "abbas",
          source: "hidden",
          normalized: pk,
        };
        return jsonPretty(wrapped, 200);
      }
    } catch (err) {
      // If anything unexpected happens
      return json(
        { status: false, message: "Server error", developer: "abbas" },
        500
      );
    }
  },
};

function normalizePkNumber(raw) {
  if (raw == null) return null;

  const s = String(raw).trim();
  if (!s) return null;

  // keep only digits
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // If you want CORS, uncomment:
      // "access-control-allow-origin": "*",
    },
  });
}

function jsonPretty(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 4), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // "access-control-allow-origin": "*",
    },
  });
}