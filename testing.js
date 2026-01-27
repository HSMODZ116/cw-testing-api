export default {
  async fetch(request, env) {
    // ❌ Only GET allowed
    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({ ok: false, error: "Only GET method allowed" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const prompt = searchParams.get("prompt");

    if (!prompt) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing ?prompt parameter" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const response = await fetch("https://fluxai.pro/api/tools/fast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://fluxai.pro",
        "Referer": "https://fluxai.pro/fast-flux",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Mobile Safari/537.36",
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};