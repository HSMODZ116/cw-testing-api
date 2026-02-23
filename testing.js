export default {
  async fetch(request: Request): Promise<Response> {
    const urlObj = new URL(request.url);

    // Simple routing: only /tik/dl
    if (urlObj.pathname !== "/tik/dl") {
      return new Response("Not Found", { status: 404 });
    }

    const tiktokUrl = urlObj.searchParams.get("url") || "";
    if (!tiktokUrl || !tiktokUrl.startsWith("https://www.tiktok.com/")) {
      return json({
        success: false,
        error: "Invalid or missing TikTok URL",
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      }, 400);
    }

    try {
      const htmlContent = await fetchTikTokData(tiktokUrl);

      // Extract only snapcdn.app links to avoid 403 errors
      const links = [...htmlContent.matchAll(/href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)"/g)]
        .map(m => m[1]);

      if (!links.length) {
        return json({
          success: false,
          error: "No downloadable links found",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        }, 404);
      }

      const result = links.map((link) => {
        const filename = buildFilenameFromToken(link, tiktokUrl);
        return { url: link, filename };
      });

      return json({
        success: true,
        links: result,
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      }, 200);

    } catch (err: any) {
      const msg = (err?.message || String(err || "Unknown error"));
      const isTimeout = msg.toLowerCase().includes("timed out") || msg.toLowerCase().includes("timeout");

      return json({
        success: false,
        error: msg,
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      }, isTimeout ? 504 : 500);
    }
  }
};

const API_URL = "https://tikdownloader.io/api/ajaxSearch";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://tikdownloader.io/",
  "Origin": "https://tikdownloader.io",
};

async function fetchTikTokData(tiktokUrl: string): Promise<string> {
  const body = new URLSearchParams({
    q: tiktokUrl,
    lang: "en",
  });

  // Worker fetch timeout approach (Cloudflare Workers me native timeout nahi hota)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: HEADERS,
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`API request failed: HTTP ${res.status}`);
    }

    const data = await res.json<any>();
    if (data?.status !== "ok") {
      throw new Error("API returned invalid status");
    }

    const html = data?.data;
    if (!html) {
      throw new Error("No data found in API response");
    }

    return html as string;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function buildFilenameFromToken(link: string, originalTikTokUrl: string): string {
  try {
    const u = new URL(link);
    const token = u.searchParams.get("token");
    if (!token) return sanitizeFilename(`TikTok_${lastPathPart(originalTikTokUrl)}`);

    const parts = token.split(".");
    if (parts.length < 2) return sanitizeFilename(`TikTok_${lastPathPart(originalTikTokUrl)}`);

    // JWT payload is base64url usually
    const payloadPart = parts[1];
    const payloadJson = base64UrlDecodeToString(payloadPart);
    const decoded = JSON.parse(payloadJson);

    const filename = decoded?.filename || "";
    if (filename) return sanitizeFilename(filename);

    return sanitizeFilename(`TikTok_${lastPathPart(originalTikTokUrl)}`);
  } catch {
    return sanitizeFilename(`TikTok_${lastPathPart(originalTikTokUrl)}`);
  }
}

function sanitizeFilename(filename: string): string {
  // remove query
  filename = filename.split("?")[0];

  // replace invalid chars
  const invalid = /[<>:"/\\|?*\u0000-\u001F]/g;
  filename = filename.replace(invalid, "_");

  // collapse underscores
  filename = filename.replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  const lower = filename.toLowerCase();
  if (!(lower.endsWith(".mp4") || lower.endsWith(".mp3"))) {
    filename += ".mp4";
  }
  return filename;
}

function lastPathPart(u: string): string {
  try {
    const x = new URL(u);
    const parts = x.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "video";
  } catch {
    const parts = u.split("/").filter(Boolean);
    return parts[parts.length - 1] || "video";
  }
}

function base64UrlDecodeToString(input: string): string {
  // base64url -> base64
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  // pad
  while (b64.length % 4) b64 += "=";

  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function json(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}