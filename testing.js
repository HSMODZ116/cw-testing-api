// Cloudflare Worker - Instagram Downloader
// Route: /insta/dl?url=...

export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") return corsPreflight();

    if (u.pathname !== "/insta/dl") {
      return json({ error: "Not Found" }, 404);
    }

    const instaUrl = (u.searchParams.get("url") || "").trim();
    if (!instaUrl) {
      return json(
        {
          status: "error",
          error: "Missing 'url' parameter",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        400
      );
    }

    try {
      const media = await fetchInstaMedia(instaUrl);

      if (!media || media.length === 0) {
        return json(
          {
            status: "error",
            error: "Media not found or unsupported",
            api_owner: "@ISmartCoder",
            api_updates: "t.me/abirxdhackz",
          },
          404
        );
      }

      return json({
        status: "success",
        media_count: media.length,
        results: media,
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      });
    } catch (e) {
      return json(
        {
          status: "error",
          error: `Server error: ${String(e?.message || e)}`,
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        500
      );
    }
  },
};

/* ---------------- CORS + JSON helpers ---------------- */

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, User-Agent, Accept, X-Requested-With",
  };
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

/* ---------------- Core logic (3-step fallback) ---------------- */

async function fetchInstaMedia(instaUrl) {
  // 1) direct regex from Instagram page
  const direct = await fetchDirectRegexMedia(instaUrl);
  if (direct && direct.length) return direct;

  // 2) instsaves.pro
  const instsaves = await fetchInstasavesMedia(instaUrl);
  if (instsaves && instsaves.length) return instsaves;

  // 3) fastdl.live
  const fastdl = await fetchFastdlMedia(instaUrl);
  if (fastdl && fastdl.length) return fastdl;

  return null;
}

/* ---------------- Method 1: Direct Regex ---------------- */

function instaHeaders() {
  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "upgrade-insecure-requests": "1",
  };
}

async function fetchDirectRegexMedia(instaUrl) {
  try {
    const resp = await fetch(instaUrl, { headers: instaHeaders(), redirect: "follow" });
    if (!resp.ok) return null;

    const html = await resp.text();

    const videoUrls = new Set();
    const thumbnails = new Set();

    // "url":"https:\/\/...mp4..."
    const videoRe = /"url"\s*:\s*"((?:https?:\\?\/\\?\/)[^"]*\.mp4[^"]*)"/gi;
    let m;
    while ((m = videoRe.exec(html)) !== null) {
      const clean = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
      videoUrls.add(clean);
    }

    // "candidates":[{"url":"..."}]
    const imgRe = /"candidates"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/gi;
    while ((m = imgRe.exec(html)) !== null) {
      const clean = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
      thumbnails.add(clean);
    }

    // fallback: "display_url":"..."
    if (thumbnails.size === 0) {
      const displayRe = /"display_url"\s*:\s*"([^"]+)"/gi;
      while ((m = displayRe.exec(html)) !== null) {
        const clean = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
        thumbnails.add(clean);
      }
    }

    if (videoUrls.size === 0 && thumbnails.size === 0) return null;

    const thumbList = Array.from(thumbnails);
    const thumbnail = thumbList.length ? thumbList[0] : null;

    const results = [];
    let videoCount = 1;
    let imageCount = 1;

    for (const v of videoUrls) {
      results.push({ label: `video${videoCount++}`, thumbnail, download: v });
    }

    for (const img of thumbnails) {
      if (!videoUrls.has(img)) {
        results.push({ label: `image${imageCount++}`, thumbnail, download: img });
      }
    }

    return results.length ? results : null;
  } catch {
    return null;
  }
}

/* ---------------- Method 2: instsaves.pro ---------------- */

async function fetchInstasavesMedia(instaUrl) {
  try {
    const apiUrl = "https://instsaves.pro/wp-json/visolix/api/download";
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ url: instaUrl, format: "", captcha_response: null }),
    });

    if (!resp.ok) return null;

    const data = await resp.json().catch(() => null);
    if (!data || !data.status || !data.data) return null;

    const html = String(data.data);

    // Each media box contains: <img ... src="..."> and <a class="visolix-download-media" href="...">text</a>
    const boxes = html.match(/<div[^>]*class="[^"]*\bvisolix-media-box\b[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) || [];
    if (boxes.length === 0) return null;

    const results = [];
    let imageCount = 1;
    let videoCount = 1;

    for (const b of boxes) {
      const imgM = b.match(/<img[^>]*src="([^"]+)"/i);
      const previewImg = imgM ? imgM[1] : null;

      const dlM = b.match(
        /<a[^>]*class="[^"]*\bvisolix-download-media\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
      );
      if (!dlM) continue;

      const downloadUrl = dlM[1];
      const downloadText = stripTags(dlM[2]).toLowerCase();

      let label = `media${results.length + 1}`;
      if (downloadText.includes("video") || downloadText.includes("igtv") || downloadText.includes("reel")) {
        label = `video${videoCount++}`;
      } else if (downloadText.includes("image") || downloadText.includes("photo")) {
        label = `image${imageCount++}`;
      } else if (downloadText.includes("story")) {
        label = `story_video${videoCount++}`;
      }

      results.push({ label, thumbnail: previewImg, download: downloadUrl });
    }

    return results.length ? results : null;
  } catch {
    return null;
  }
}

/* ---------------- Method 3: fastdl.live ---------------- */

async function fetchFastdlMedia(instaUrl) {
  try {
    const apiUrl = "https://fastdl.live/api/search";
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ url: instaUrl }),
    });

    if (!resp.ok) return null;

    const data = await resp.json().catch(() => null);
    if (!data || !data.success || !Array.isArray(data.result)) return null;

    const results = [];
    let imageCount = 1;
    let videoCount = 1;

    for (const item of data.result) {
      const t = String(item.type || "").toLowerCase();
      const label = t.includes("video") || t.includes("reel") ? `video${videoCount++}` : `image${imageCount++}`;
      const dl = item.downloadLink || null;
      if (!dl) continue;
      results.push({ label, thumbnail: item.thumbnail || null, download: dl });
    }

    return results.length ? results : null;
  } catch {
    return null;
  }
}

/* ---------------- Tiny HTML helper ---------------- */

function stripTags(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}