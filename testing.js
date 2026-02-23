export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") return corsPreflight();

    try {
      if (url.pathname === "/pnt/dl") return handlePinterest(url);
      if (url.pathname === "/tik/dl") return handleTikTok(url);

      return json({ error: "Not Found" }, 404);
    } catch (e) {
      return json(
        {
          status: "error",
          success: false,
          error: `Server error: ${String(e?.message || e)}`,
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        500
      );
    }
  },
};

/* ---------------- Common helpers ---------------- */

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

function stripTags(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

/* =========================================================
   ✅ Pinterest: /pnt/dl?url=
   ========================================================= */

async function handlePinterest(urlObj) {
  const input = (urlObj.searchParams.get("url") || "").trim();
  if (!input) {
    return json(
      {
        status: "error",
        input_url: input,
        message: "No URL provided",
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      400
    );
  }

  const base = new URL("https://www.savepin.app/download.php");
  base.searchParams.set("url", input);
  base.searchParams.set("lang", "en");
  base.searchParams.set("type", "redirect");

  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    referer: "https://www.savepin.app/",
  };

  const resp = await fetch(base.toString(), { headers, redirect: "follow" });
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const html = await safeText(resp);

  if (!resp.ok) {
    return json(
      {
        status: "error",
        input_url: input,
        message: `Failed to fetch media: HTTP ${resp.status}`,
        html_snippet: html.slice(0, 500),
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      500
    );
  }

  if (ct.includes("application/json")) {
    return json(
      {
        status: "error",
        input_url: input,
        message: "Unexpected JSON response from savepin.app",
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      500
    );
  }

  // Title <h1>...</h1>
  let title = "Unknown";
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) title = stripTags(h1[1]) || "Unknown";

  // Parse table rows -> force-save.php?url=...
  const media = [];
  const rowRe =
    /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>[\s\S]*?<a[^>]*class="[^"]*\bbutton\b[^"]*\bis-success\b[^"]*\bis-small\b[^"]*"[^>]*href="([^"]+)"[\s\S]*?<\/a>[\s\S]*?<\/td>\s*<\/tr>/gi;

  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const quality = stripTags(m[1]);
    const formatType = stripTags(m[2]).toLowerCase();
    const href = m[3];

    if (!href) continue;
    if (!href.startsWith("force-save.php?url=")) continue;

    const raw = href.replace("force-save.php?url=", "");
    const mediaUrl = decodeURIComponent(raw);

    media.push({
      quality,
      url: mediaUrl,
      type: formatType === "jpg" ? "image/jpeg" : "video/mp4",
    });
  }

  const result = {
    status: media.length ? "success" : "error",
    input_url: input,
    title,
    media,
    api_owner: "@ISmartCoder",
    api_updates: "t.me/abirxdhackz",
  };

  if (!media.length) {
    result.message = "No media found for the provided URL";
    result.html_snippet = html.slice(0, 500);
  }

  return json(result);
}

/* =========================================================
   ✅ TikTok: /tik/dl?url=
   ========================================================= */

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
  let input = normalizeTikTokUrl(urlObj.searchParams.get("url") || "");
  input = await resolveRedirectTikTok(input);

  if (!input || !isTikTokUrl(input)) {
    return json(
      {
        success: false,
        error: "Invalid or missing TikTok URL",
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      400
    );
  }

  const htmlContent = await fetchTikTokHtml(input);
  if (htmlContent.error) {
    const code = htmlContent.error.toLowerCase().includes("timeout") ? 504 : 500;
    return json(
      {
        success: false,
        error: htmlContent.error,
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      code
    );
  }

  // Extract snapcdn links
  const links = [];
  const fileNames = [];
  const re = /href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)"/gi;

  let m;
  while ((m = re.exec(htmlContent.data)) !== null) {
    const link = m[1];
    links.push(link);

    const filename =
      decodeFilenameFromToken(link) ||
      sanitizeFilename(`TikTok_${input.split("/").filter(Boolean).pop() || "video"}`);
    fileNames.push(filename);
  }

  if (!links.length) {
    return json(
      {
        success: false,
        error: "No downloadable links found",
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      },
      404
    );
  }

  const result = links.map((l, i) => ({ url: l, filename: fileNames[i] }));
  return json({
    success: true,
    links: result,
    api_owner: "@ISmartCoder",
    api_updates: "t.me/abirxdhackz",
  });
}

function normalizeTikTokUrl(raw) {
  raw = String(raw || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) raw = "https:" + raw;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  return raw;
}

async function resolveRedirectTikTok(u) {
  try {
    const r = await fetch(u, {
      headers: { "user-agent": TIK_HEADERS["user-agent"] },
      redirect: "follow",
    });
    return r.url || u;
  } catch {
    return u;
  }
}

function isTikTokUrl(u) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host.includes("tiktok.com") || host.includes("vt.tiktok.com") || host.includes("vm.tiktok.com");
  } catch {
    return false;
  }
}

function sanitizeFilename(filename) {
  filename = String(filename || "").split("?")[0];
  const invalid = '<>:"/\\|?*';
  for (const ch of invalid) filename = filename.split(ch).join("_");
  filename = filename.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!/\.(mp4|mp3)$/i.test(filename)) filename += ".mp4";
  return filename || "tiktok.mp4";
}

async function fetchTikTokHtml(tiktokUrl) {
  try {
    const body = new URLSearchParams({ q: tiktokUrl, lang: "en" });

    const resp = await fetch(TIK_API_URL, {
      method: "POST",
      headers: TIK_HEADERS,
      body,
    });

    if (!resp.ok) {
      return { error: `API request failed: HTTP ${resp.status}`, data: null };
    }

    const data = await resp.json().catch(() => null);
    if (!data || data.status !== "ok") return { error: "API returned invalid status", data: null };
    if (!data.data) return { error: "No data found in API response", data: null };

    return { error: null, data: String(data.data) };
  } catch (e) {
    return { error: `Unexpected error: ${String(e?.message || e)}`, data: null };
  }
}

function decodeFilenameFromToken(snapUrl) {
  try {
    const u = new URL(snapUrl);
    const token = u.searchParams.get("token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    const payload = parts[1];
    const jsonStr = base64UrlDecode(payload);
    const obj = JSON.parse(jsonStr);

    const fn = obj?.filename ? String(obj.filename) : "";
    if (!fn) return null;
    return sanitizeFilename(fn);
  } catch {
    return null;
  }
}

function base64UrlDecode(b64url) {
  let s = String(b64url || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";

  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}