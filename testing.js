export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only GET (simple)
    if (request.method !== "GET") {
      return json(
        {
          status: false,
          message: "Method not allowed",
          developer: "Haseeb Sahil",
          channel: "@hsmodzofc2",
        },
        405
      );
    }

    const raw = url.searchParams.get("num");

    // If num missing -> show usage/help
    if (!raw) {
      return json(
        usageResponse(url),
        200
      );
    }

    const pk = normalizePkNumber(raw);

    // If invalid -> show usage/help (instead of invalid-number JSON)
    if (!pk) {
      return json(
        usageResponse(url, "Invalid number. Please use correct format."),
        200
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
    });

    if (!upstreamRes.ok) {
      return json(
        {
          status: false,
          message: "Source API error",
          developer: "Haseeb Sahil",
          channel: "@hsmodzofc2",
        },
        502
      );
    }

    const text = await upstreamRes.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return json(
        {
          status: false,
          message: "Source returned non-JSON response",
          developer: "Haseeb Sahil",
          channel: "@hsmodzofc2",
        },
        502
      );
    }

    // Attach your branding + normalized
    if (isPlainObject(data)) {
      data.developer = "Haseeb Sahil";
      data.channel = "@hsmodzofc2";
      data.source = "hidden";
      data.normalized = pk;
      return jsonPretty(data, 200);
    }

    return jsonPretty(
      {
        result: data,
        developer: "Haseeb Sahil",
        channel: "@hsmodzofc2",
        source: "hidden",
        normalized: pk,
      },
      200
    );
  },
};

// ---------- Helpers ----------

function usageResponse(url, note) {
  const origin = url.origin || "";
  return {
    status: true,
    message: note || "API is working. Use query parameter `num` to search.",
    how_to_use: {
      format: "GET /?num=NUMBER",
      examples: [
        `${origin}/?num=03068060398`,
        `${origin}/?num=923068060398`,
        `${origin}/?num=+923068060398`,
      ],
      accepted_formats: [
        "030xxxxxxxx (11 digits)",
        "92xxxxxxxxxx (12 digits)",
        "3xxxxxxxxx (10 digits)",
      ],
      note: "Only Pakistani numbers supported.",
    },
    developer: "Haseeb Sahil",
    channel: "@hsmodzofc2",
  };
}

function normalizePkNumber(raw) {
  const s = String(raw || "").trim();
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function jsonPretty(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 4), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}