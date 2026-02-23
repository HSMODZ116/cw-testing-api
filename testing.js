// TikTok Downloader - Optimized Version
// @ISmartCoder | Updates: t.me/abirxdhackz

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "Content-Type, User-Agent",
        },
      });
    }

    // Sirf TikTok endpoint handle karega
    if (url.pathname === "/tik/dl") {
      return handleTikTok(url);
    }

    // Root path ke liye info response
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify(
          {
            name: "TikTok Downloader API",
            version: "1.0.0",
            endpoints: {
              "/tik/dl": "GET - ?url= [TikTok video URL]",
            },
            example: "/tik/dl?url=https://www.tiktok.com/@username/video/123456789",
            api_owner: "@ISmartCoder",
            api_updates: "t.me/abirxdhackz",
          },
          null,
          2
        ),
        {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
          },
        }
      );
    }

    // 404 for other routes
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: "Not Found",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        null,
        2
      ),
      {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
        },
      }
    );
  },
};

// TikTok API Configuration
const TIK_API_URL = "https://tikdownloader.io/api/ajaxSearch";
const TIK_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  accept: "application/json, text/javascript, */*; q=0.01",
  "x-requested-with": "XMLHttpRequest",
  referer: "https://tikdownloader.io/",
  origin: "https://tikdownloader.io",
};

async function handleTikTok(urlObj) {
  try {
    // Get and validate URL
    let input = urlObj.searchParams.get("url") || "";
    input = input.trim();

    if (!input) {
      return jsonResponse(
        {
          success: false,
          error: "No URL provided. Please add ?url= [TikTok URL]",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        400
      );
    }

    // Normalize URL
    input = normalizeUrl(input);

    // Resolve redirect (for vt.tiktok.com, vm.tiktok.com)
    input = await resolveRedirect(input);

    // Validate if it's a TikTok URL
    if (!isTikTokUrl(input)) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid TikTok URL. Please provide a valid TikTok video URL",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        400
      );
    }

    // Fetch data from API
    const { html, error, statusCode } = await fetchTikTokData(input);

    if (error) {
      return jsonResponse(
        {
          success: false,
          error: error,
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        statusCode || 500
      );
    }

    // Extract download links
    const links = extractDownloadLinks(html, input);

    if (!links.length) {
      return jsonResponse(
        {
          success: false,
          error: "No downloadable links found for this video",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        404
      );
    }

    // Success response
    return jsonResponse(
      {
        success: true,
        video_url: input,
        links: links,
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: `Server error: ${error.message || "Unknown error"}`,
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      500
    );
  }
}

// Helper: JSON Response
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

// Helper: Normalize URL
function normalizeUrl(url) {
  url = String(url || "").trim();
  if (!url) return "";
  if (url.startsWith("//")) url = "https:" + url;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

// Helper: Resolve redirects
async function resolveRedirect(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": TIK_HEADERS["user-agent"] },
      redirect: "follow",
    });
    return response.url || url;
  } catch {
    return url;
  }
}

// Helper: Check if TikTok URL
function isTikTokUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname.includes("tiktok.com") ||
      hostname.includes("vt.tiktok.com") ||
      hostname.includes("vm.tiktok.com")
    );
  } catch {
    return false;
  }
}

// Helper: Fetch TikTok data
async function fetchTikTokData(tiktokUrl) {
  try {
    const body = new URLSearchParams({
      q: tiktokUrl,
      lang: "en",
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(TIK_API_URL, {
      method: "POST",
      headers: TIK_HEADERS,
      body: body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        error: `API request failed: HTTP ${response.status}`,
        statusCode: response.status,
      };
    }

    const data = await response.json();

    if (data.status !== "ok") {
      return { error: "API returned invalid status", statusCode: 500 };
    }

    if (!data.data) {
      return { error: "No data found in API response", statusCode: 404 };
    }

    return { html: String(data.data) };
  } catch (error) {
    if (error.name === "AbortError") {
      return { error: "Request timeout (10 seconds)", statusCode: 504 };
    }
    return { error: `Fetch error: ${error.message}`, statusCode: 500 };
  }
}

// Helper: Extract download links
function extractDownloadLinks(html, originalUrl) {
  const links = [];
  const snapcdnRegex = /href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)"/gi;

  let match;
  while ((match = snapcdnRegex.exec(html)) !== null) {
    const downloadUrl = match[1];
    const filename = extractFilenameFromToken(downloadUrl) || generateFilename(originalUrl);
    
    links.push({
      url: downloadUrl,
      filename: filename,
      quality: detectQuality(filename),
    });
  }

  // Remove duplicates (if any)
  const uniqueLinks = [];
  const seen = new Set();
  for (const link of links) {
    if (!seen.has(link.url)) {
      seen.add(link.url);
      uniqueLinks.push(link);
    }
  }

  return uniqueLinks;
}

// Helper: Extract filename from token
function extractFilenameFromToken(snapUrl) {
  try {
    const url = new URL(snapUrl);
    const token = url.searchParams.get("token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    // Decode base64url
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";

    const decoded = atob(base64);
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    const jsonStr = new TextDecoder("utf-8").decode(bytes);
    const obj = JSON.parse(jsonStr);

    return obj?.filename ? sanitizeFilename(obj.filename) : null;
  } catch {
    return null;
  }
}

// Helper: Generate filename
function generateFilename(url) {
  const videoId = url.split("/").pop() || "video";
  return sanitizeFilename(`TikTok_${videoId}.mp4`);
}

// Helper: Sanitize filename
function sanitizeFilename(filename) {
  filename = String(filename || "").split("?")[0];
  
  // Remove invalid characters
  filename = filename.replace(/[<>:"/\\|?*]/g, "_");
  filename = filename.replace(/_+/g, "_");
  filename = filename.replace(/^_+|_+$/g, "");
  
  // Ensure extension
  if (!/\.(mp4|mp3)$/i.test(filename)) {
    filename += ".mp4";
  }
  
  return filename || "tiktok_video.mp4";
}

// Helper: Detect quality from filename
function detectQuality(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("720p") || lower.includes("hd")) return "HD (720p)";
  if (lower.includes("360p")) return "360p";
  if (lower.includes("watermark")) return "With Watermark";
  if (lower.includes("no watermark") || lower.includes("nowatermark")) return "No Watermark";
  return "Unknown";
}