export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ ok: false, error: "Only GET allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const urlObj = new URL(request.url);
    const prompt = urlObj.searchParams.get("prompt");

    if (!prompt) {
      return new Response(JSON.stringify({ ok: false, error: "Missing ?prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // 1) Call fluxai
    const res1 = await fetch("https://fluxai.pro/api/tools/fast", {
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

    const json1 = await res1.json(); // expecting {ok:true, data:{imageUrl:"..."}}

    const imageUrl = json1?.data?.imageUrl;
    if (!imageUrl) {
      // return original response if imageUrl missing
      return new Response(JSON.stringify(json1), {
        status: res1.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // 2) Auto-fetch the imageUrl result
    const res2 = await fetch(imageUrl, { method: "GET" });

    // If it's an image -> return image directly
    const ct = res2.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return new Response(res2.body, {
        status: res2.status,
        headers: {
          "Content-Type": ct,
          "Access-Control-Allow-Origin": "*",
          // optional: force download
          // "Content-Disposition": "inline; filename=output.png",
        },
      });
    }

    // Otherwise return text/json from imageUrl endpoint
    const text2 = await res2.text();
    return new Response(text2, {
      status: res2.status,
      headers: {
        "Content-Type": res2.headers.get("content-type") || "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};