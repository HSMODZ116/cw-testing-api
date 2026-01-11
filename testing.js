/**
 * Instagram Downloader API - Cloudflare Worker
 * Ported from FastAPI to JavaScript
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Sirf /insta/dl path ko handle karne ke liye
    if (url.pathname === "/insta/dl") {
      return await handleDownload(url);
    }

    return new Response(JSON.stringify({ error: "Route not found. Use /insta/dl?url=..." }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
};

const FOOTER = {
  api_owner: "@ISmartCoder",
  api_updates: "t.me/abirxdhackz"
};

const HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
};

async function handleDownload(urlParams) {
  const targetUrl = urlParams.searchParams.get("url");

  if (!targetUrl) {
    return new Response(JSON.stringify({ status: "error", error: "Missing 'url' parameter", ...FOOTER }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // Method 1: Direct Regex Scrape
    let results = await fetchDirectRegex(targetUrl);
    
    // Method 2: Instsaves.pro if Method 1 fails
    if (!results) {
      console.log("Direct regex failed, trying instsaves.pro");
      results = await fetchInstasaves(targetUrl);
    }

    // Method 3: FastDL if others fail
    if (!results) {
      console.log("Instsaves failed, trying fastdl.live");
      results = await fetchFastDL(targetUrl);
    }

    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ status: "error", error: "Media not found or unsupported", ...FOOTER }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      status: "success",
      media_count: results.length,
      results: results,
      ...FOOTER
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ status: "error", error: `Server error: ${e.message}`, ...FOOTER }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// --- Method 1: Direct Regex ---
async function fetchDirectRegex(instaUrl) {
  try {
    const response = await fetch(instaUrl, { headers: HEADERS });
    if (!response.ok) return null;
    const html = await response.text();

    const videoUrls = new Set();
    const thumbnails = new Set();

    // Video Regex
    const videoPattern = /"url"\s*:\s*"(https?:\\?\/\\?\/[^"]*\.mp4[^"]*)"/gi;
    let match;
    while ((match = videoPattern.exec(html)) !== null) {
      videoUrls.add(match[1].replace(/\\/g, '').replace(/u0026/g, '&'));
    }

    // Image Regex
    const imgPattern = /"candidates"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/gi;
    while ((match = imgPattern.exec(html)) !== null) {
      thumbnails.add(match[1].replace(/\\/g, '').replace(/u0026/g, '&'));
    }

    if (videoUrls.size === 0 && thumbnails.size === 0) return null;

    const results = [];
    const thumbArray = Array.from(thumbnails);
    const mainThumb = thumbArray[0] || null;

    let vCount = 1;
    videoUrls.forEach(v => {
      results.append({ label: `video${vCount++}`, thumbnail: mainThumb, download: v });
    });

    let iCount = 1;
    thumbnails.forEach(img => {
      if (!videoUrls.has(img)) {
        results.push({ label: `image${iCount++}`, thumbnail: mainThumb, download: img });
      }
    });

    return results.length > 0 ? results : null;
  } catch (e) { return null; }
}

// --- Method 2: Instsaves.pro ---
async function fetchInstasaves(instaUrl) {
  try {
    const apiUrl = "https://instsaves.pro/wp-json/visolix/api/download";
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...HEADERS },
      body: JSON.stringify({ url: instaUrl, format: "", captcha_response: null })
    });

    const data = await response.json();
    if (!data.status || !data.data) return null;

    const htmlContent = data.data;
    const results = [];
    
    // Regex to match visolix-media-box content
    const boxPattern = /<div class="visolix-media-box">([\s\S]*?)<\/div>/gi;
    let boxMatch;
    let vCount = 1, iCount = 1;

    while ((boxMatch = boxPattern.exec(htmlContent)) !== null) {
      const content = boxMatch[1];
      const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i);
      const dlMatch = content.match(/<a[^>]+href="([^"]+)"[^>]+class="visolix-download-media"/i);
      const textMatch = content.match(/visolix-download-media[^>]*>([\s\S]*?)<\/a>/i);

      if (dlMatch) {
        const dUrl = dlMatch[1];
        const dText = (textMatch ? textMatch[1] : "").toLowerCase();
        let label = "media";

        if (dText.includes("video") || dText.includes("reel")) label = `video${vCount++}`;
        else if (dText.includes("image") || dText.includes("photo")) label = `image${iCount++}`;

        results.push({
          label: label,
          thumbnail: imgMatch ? imgMatch[1] : null,
          download: dUrl
        });
      }
    }
    return results.length > 0 ? results : null;
  } catch (e) { return null; }
}

// --- Method 3: FastDL.live ---
async function fetchFastDL(instaUrl) {
  try {
    const response = await fetch("https://fastdl.live/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...HEADERS },
      body: JSON.stringify({ url: instaUrl })
    });

    const data = await response.json();
    if (!data.success || !data.result) return null;

    let vCount = 1, iCount = 1;
    return data.result.map(item => {
      const type = (item.type || "").toLowerCase();
      return {
        label: (type.includes("video") || type.includes("reel")) ? `video${vCount++}` : `image${iCount++}`,
        thumbnail: item.thumbnail,
        download: item.downloadLink
      };
    });
  } catch (e) { return null; }
}