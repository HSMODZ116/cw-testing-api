export default {
  async fetch(request, env, ctx) {
    const urlObj = new URL(request.url);

    // Only handle: /fb/dl
    if (urlObj.pathname !== "/fb/dl") {
      return json({ error: "Not Found" }, 404);
    }

    const fbUrl = (urlObj.searchParams.get("url") || "").trim();

    if (!fbUrl) {
      return json(
        {
          error: "Missing 'url' query parameter",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        400
      );
    }

    // Basic allowlist for facebook URLs
    if (!["facebook.com", "fb.watch", "fb.com"].some((x) => fbUrl.includes(x))) {
      return json(
        {
          error: "Only Facebook URLs are supported!",
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        400
      );
    }

    try {
      // Form payload like Python: {"URLz": url}
      const form = new URLSearchParams();
      form.set("URLz", fbUrl);

      const resp = await fetch("https://fdown.net/download.php", {
        method: "POST",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://fdown.net",
          Referer: "https://fdown.net/",
        },
        body: form.toString(),
      });

      if (!resp.ok) {
        return json(
          {
            error: "Third-party service temporarily down",
            api_owner: "@ISmartCoder",
            api_updates: "t.me/abirxdhackz",
          },
          502
        );
      }

      const html = await resp.text();

      // ---------------- Title ----------------
      let title = "Facebook Video";
      {
        const m = html.match(
          /<div[^>]*class=["'][^"']*\blib-row\b[^"']*\blib-header\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
        );
        if (m) {
          const raw = stripTags(m[1]).trim();
          if (raw && raw !== "No video title") title = decodeHtml(raw);
        }
      }

      // ---------------- Thumbnail (strong fallback) ----------------
      let thumbnail = null;

      // 1) lib-img-show src/data-src
      {
        let m = html.match(
          /<img[^>]*class=["'][^"']*\blib-img-show\b[^"']*["'][^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i
        );
        if (m) thumbnail = decodeHtml(m[1]);
      }

      // 2) og:image meta fallback
      if (!thumbnail) {
        const m = html.match(
          /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i
        );
        if (m) thumbnail = decodeHtml(m[1]);
      }

      // Remove known "no-thumbnail"
      if (thumbnail && thumbnail.includes("no-thumbnail")) thumbnail = null;

      // ---------------- Download links (VIDEO ONLY) ----------------
      const links = [];
      const anchorRe =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

      let match;
      while ((match = anchorRe.exec(html)) !== null) {
        const href = decodeHtml(match[1] || "").trim();
        const text = decodeHtml(stripTags(match[2] || "")).trim();

        const hrefLower = href.toLowerCase();
        const textLower = text.toLowerCase();

        // ✅ Only keep actual video links (fbcdn + mp4/m4v or video)
        const isVideo =
          href.startsWith("http") &&
          hrefLower.includes("fbcdn.net") &&
          (hrefLower.includes(".mp4") ||
            hrefLower.includes(".m4v") ||
            hrefLower.includes("video"));

        if (!isVideo) continue;

        let quality = "Unknown";
        if (textLower.includes("hd") || textLower.includes("high")) {
          quality = "HD";
        } else if (
          textLower.includes("sd") ||
          textLower.includes("normal") ||
          textLower.includes("low")
        ) {
          quality = "SD";
        } else if (text) {
          quality = text;
        }

        links.push({ quality, url: href });
      }

      // Dedupe by URL
      const seen = new Set();
      const uniqueLinks = [];
      for (const item of links) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          uniqueLinks.push(item);
        }
      }

      // Prefer HD first (optional but nice)
      uniqueLinks.sort((a, b) => {
        const rank = (q) => (q === "HD" ? 0 : q === "SD" ? 1 : 2);
        return rank(a.quality) - rank(b.quality);
      });

      if (!uniqueLinks.length) {
        return json(
          {
            error: "No downloadable links found",
            api_owner: "@ISmartCoder",
            api_updates: "t.me/abirxdhackz",
          },
          404
        );
      }

      return json({
        title,
        thumbnail,
        links: uniqueLinks,
        total_links: uniqueLinks.length,
        api_owner: "@ISmartCoder",
        api_updates: "t.me/abirxdhackz",
      });
    } catch (e) {
      return json(
        {
          error: `Server error: ${String(e && e.message ? e.message : e)}`,
          api_owner: "@ISmartCoder",
          api_updates: "t.me/abirxdhackz",
        },
        500
      );
    }
  },
};

// ---------------- helpers ----------------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, " ");
}

function decodeHtml(s) {
  // Minimal decode for common entities
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}