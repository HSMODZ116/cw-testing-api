addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

function respond(data, status = 200, pretty = false) {
  const body = pretty ? JSON.stringify(data, null, 4) : JSON.stringify(data);
  return new Response(body, {
    status,
    headers: HEADERS,
  });
}

function usageResponse(url, note) {
  return {
    status: true,
    message: note || "API is working. Use query parameter `num`.",
    how_to_use: {
      format: "GET /?num=NUMBER",
      examples: [
        `${url.origin}/?num=03068060398`,
        `${url.origin}/?num=923068060398`,
        `${url.origin}/?num=+923068060398`,
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

function normalizeNumber(input) {
  // keep digits only (and optional leading +)
  const raw = String(input || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/[^\d]/g, "");

  // Pakistan formats:
  // 030xxxxxxxx (11 digits) => +92 + 3xxxxxxxxx
  if (digits.startsWith("03") && digits.length === 11) {
    return "+92" + digits.slice(1);
  }

  // 92xxxxxxxxxx (12 digits) => +92xxxxxxxxxx
  if (digits.startsWith("92") && digits.length === 12) {
    return "+" + digits;
  }

  // 3xxxxxxxxx (10 digits) => +923xxxxxxxxx
  if (digits.startsWith("3") && digits.length === 10) {
    return "+92" + digits;
  }

  return null;
}

async function handleRequest(request) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  if (request.method !== "GET") {
    return respond(
      {
        status: false,
        message: "Only GET method allowed",
        developer: "Haseeb Sahil",
        channel: "@hsmodzofc2",
      },
      405
    );
  }

  const url = new URL(request.url);

  // If no num -> show usage guide
  const originalInput = url.searchParams.get("num");
  if (!originalInput) {
    return respond(usageResponse(url), 200, true);
  }

  const normalized = normalizeNumber(originalInput);

  // If invalid -> show usage guide (no "Invalid Pakistani number" response)
  if (!normalized) {
    return respond(
      usageResponse(url, "Invalid number. Please use correct format."),
      200,
      true
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // CallApp expects URL-encoded plus sign
    const cpn = normalized.replace("+", "%2B");

    const apiUrl =
      "https://s.callapp.com/callapp-server/csrch" +
      `?cpn=${cpn}` +
      "&myp=fb.877409278562861&ibs=0&cid=0" +
      "&tk=0080528975&cvc=2239";

    const res = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; wv)",
        "Accept-Encoding": "identity",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error("Upstream API error");

    const data = await res.json();

    // add branding + normalized
    if (data && typeof data === "object" && !Array.isArray(data)) {
      data.developer = "Haseeb Sahil";
      data.channel = "@hsmodzofc2";
      data.source = "hidden";
      data.normalized = normalized;
      return respond(data, 200, true);
    }

    return respond(
      {
        result: data,
        developer: "Haseeb Sahil",
        channel: "@hsmodzofc2",
        source: "hidden",
        normalized: normalized,
      },
      200,
      true
    );
  } catch (err) {
    return respond(
      {
        status: false,
        message: err && err.name === "AbortError" ? "Request timeout" : "Internal server error",
        developer: "Haseeb Sahil",
        channel: "@hsmodzofc2",
      },
      500
    );
  }
}