/**
 * Instagram Downloader API - Cloudflare Worker (Fixed Version)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Sirf /insta/dl path ko handle karein
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

// Realistic Browser Headers
const HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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
    let results = null;

    // Method 1: FastDL (Sabse reliable method filhal yahi hai)
    results = await fetchFastDL(targetUrl);

    // Method 2: Instsaves.pro (Fallback)
    if (!results) {
      results = await fetchInstasaves(targetUrl);
    }

    // Method 3: Direct Regex (Last resort)
    if (!results) {
      results = await fetchDirectRegex(targetUrl);
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
    return new Response(JSON.stringify({ status: "error", error: `Worker Error: ${e.message}`, ...FOOTER }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// --- Method: FastDL.live (Highly Recommended) ---
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

// --- Method: Instsaves.pro ---
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
    const boxPattern = /<div class="visolix-media-box">([\s\S]*?)<\/div>/gi;
    let boxMatch;
    let vCount = 1, iCount = 1;

    while ((boxMatch = boxPattern.exec(htmlContent)) !== null) {
      const content = boxMatch[1];
      const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i);
      const dlMatch = content.match(/<a[^>]+href="([^"]+)"[^>]+class="visolix-download-media"/i);
      const textMatch = content.match(/visolix-download-media[^>]*>([\s\S]*?)<\/a>/i);

      if (dlMatch) {
        const dText = (textMatch ? textMatch[1] : "").toLowerCase();
        results.push({
          label: (dText.includes("video") || dText.includes("reel")) ? `video${vCount++}` : `image${iCount++}`,
          thumbnail: imgMatch ? imgMatch[1] : null,
          download: dlMatch[1]
        });
      }
    }
    return results.length > 0 ? results : null;
  } catch (e) { return null; }
}

// --- Method: Direct Regex ---
async function fetchDirectRegex(instaUrl) {
  try {
    const response = await fetch(instaUrl, { headers: HEADERS });
    const html = await response.text();
    const results = [];

    // Video Pattern
    const videoPattern = /"video_url":"([^"]+)"/g;
    let match;
    let vCount = 1;
    while ((match = videoPattern.exec(html)) !== null) {
      results.push({
        label: `video${vCount++}`,
        thumbnail: null,
        download: match[1].replace(/\\u0026/g, '&')
      });
    }

    // Image Pattern
    if (results.length === 0) {
      const imgPattern = /"display_url":"([^"]+)"/g;
      let iCount = 1;
      while ((match = imgPattern.exec(html)) !== null) {
        results.push({
          label: `image${iCount++}`,
          thumbnail: null,
          download: match[1].replace(/\\u0026/g, '&')
        });
        if (iCount > 1) break; // Sirf pehli image lein
      }
    }

    return results.length > 0 ? results : null;
  } catch (e) { return null; }
}