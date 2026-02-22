// Cloudflare Worker - Facebook Downloader (via fdown.net)
// Route: /fb/dl?url=...

export default {
  async fetch(request, env, ctx) {
    try {
      const urlObj = new URL(request.url);

      // Only handle /fb/dl
      if (urlObj.pathname !== "/fb/dl") {
        return json({ error: "Not Found" }, 404);
      }

      const inputUrl = (urlObj.searchParams.get("url") || "").trim();
      if (!inputUrl) {
        return json(
          {
            error: "Missing 'url' query parameter",
            developer: "Haseeb Sahil",
            tg_channal: "@hsmodzofc2",
          },
          400
        );
      }

      if (!isFacebookUrl(inputUrl)) {
        return json(
          {
            error: "Only Facebook URLs are supported!",
            developer: "Haseeb Sahil",
            tg_channal: "@hsmodzofc2",
          },
          400
        );
      }

      // Headers (avoid br/zstd issues; keep it simple)
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://fdown.net/",
        Origin: "https://fdown.net",
      };

      // 1) resolve final FB URL (follow redirects)
      const finalFbUrl = await resolveFinalUrl(inputUrl, headers);

      // 2) call fdown
      const form = new FormData();
      form.append("URLz", finalFbUrl);

      const fdownResp = await fetch("https://fdown.net/download.php", {
        method: "POST",
        headers, // FormData sets boundary itself; CF will handle it fine
        body: form,
        redirect: "follow",
      });

      if (!fdownResp.ok) {
        return json(
          {
            error: "Third-party service temporarily down",
            developer: "Haseeb Sahil",
            tg_channal: "@hsmodzofc2",
          },
          502
        );
      }

      const html = await fdownResp.text();

      // 3) Parse title, thumbnail
      const title = parseTitle(html);
      const thumbnail = parseThumbnail(html);

      // 4) Extract download links (prefer buttons)
      let links = extractButtonLinks(html);

      // fallback: scan all anchors but keep only real links
      if (links.length === 0) {
        links = extractAllVideoLinks(html);
      }

      // dedupe
      const seen = new Set();
      const unique = [];
      for (const it of links) {
        if (!seen.has(it.url)) {
          seen.add(it.url);
          unique.push(it);
        }
      }

      if (unique.length === 0) {
        return json(
          {
            error:
              "No downloadable links found (fdown returned no links; video may be private/age/region locked, or fdown blocked your server IP).",
            developer: "Haseeb Sahil",
            tg_channal: "@hsmodzofc2",
          },
          404
        );
      }

      return json({
        title,
        thumbnail,
        links: unique,
        total_links: unique.length,
        developer: "Haseeb Sahil",
        tg_channal: "@hsmodzofc2",
      });
    } catch (e) {
      return json(
        {
          error: `Server error: ${String(e && e.message ? e.message : e)}`,
          developer: "Haseeb Sahil",
          tg_channal: "@hsmodzofc2",
        },
        500
      );
    }
  },
};

/* ---------------- Helpers ---------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function isFacebookUrl(u) {
  try {
    const host = (new URL(u).hostname || "").toLowerCase();
    return (
      host.includes("facebook.com") ||
      host.includes("fb.watch") ||
      host.includes("fb.com") ||
      host.includes("m.facebook.com") ||
      host.includes("mbasic.facebook.com")
    );
  } catch {
    return false;
  }
}

async function resolveFinalUrl(inputUrl, headers) {
  // Use fetch redirect follow; final URL is in resp.url
  const r = await fetch(inputUrl, { headers, redirect: "follow" });
  return r.url || inputUrl;
}

function qualityFromText(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("hd") || s.includes("high")) return "HD";
  if (s.includes("sd") || s.includes("normal") || s.includes("low")) return "SD";
  if (s.includes("audio")) return "AUDIO";
  return "Unknown";
}

function isJunkLink(href) {
  const h = String(href || "").toLowerCase();

  const junkDomains = [
    "chrome.google.com",
    "play.google.com",
    "microsoft.com",
    "addons.mozilla.org",
    "opera.com",
    "edge.microsoft.com",
    "webstore",
  ];
  if (junkDomains.some((d) => h.includes(d))) return true;

  const junkMarkers = ["doubleclick", "googlesyndication", "adsystem", "utm_", "affiliate"];
  if (junkMarkers.some((m) => h.includes(m))) return true;

  return false;
}

function isRealVideoLink(href) {
  const h = String(href || "").toLowerCase();
  if (h.includes("fbcdn.net")) return true;
  if (h.includes("video_redirect")) return true;
  if (h.includes("/download.php")) return true;
  if (h.endsWith(".mp4") && h.includes("facebook")) return true;
  return false;
}

/**
 * Very light HTML parsing using regex (works fine for fdown layout)
 * If fdown changes HTML heavily, you may need to adjust patterns.
 */
function parseTitle(html) {
  // <div class="lib-row lib-header">TITLE</div>
  const m = html.match(/<div[^>]*class="[^"]*\blib-row\b[^"]*\blib-header\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return "Facebook Video";
  const text = stripTags(m[1]).trim();
  if (!text || text.toLowerCase() === "no video title") return "Facebook Video";
  return text;
}

function parseThumbnail(html) {
  // <img class="lib-img-show" src="...">
  const m = html.match(/<img[^>]*class="[^"]*\blib-img-show\b[^"]*"[^>]*src="([^"]+)"/i);
  if (!m) return null;
  const src = (m[1] || "").trim();
  if (!src) return null;
  if (src.includes("no-thumbnail-fbdown.png")) return null;
  return src;
}

function extractButtonLinks(html) {
  // <a class="btn btn-download" href="...">HD / SD...</a>
  const out = [];
  const re = /<a[^>]*class="[^"]*\bbtn\b[^"]*\bbtn-download\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || "").trim();
    const text = stripTags(m[2]).trim();

    if (!href.startsWith("http")) continue;
    if (isJunkLink(href)) continue;
    if (!isRealVideoLink(href)) continue;

    out.push({ quality: qualityFromText(text), url: href });
  }
  return out;
}

function extractAllVideoLinks(html) {
  const out = [];
  const re = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || "").trim();
    const text = stripTags(m[2]).trim();

    if (!href.startsWith("http")) continue;
    if (isJunkLink(href)) continue;
    if (!isRealVideoLink(href)) continue;

    out.push({ quality: qualityFromText(text), url: href });
  }
  return out;
}

function stripTags(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}