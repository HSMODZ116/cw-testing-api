export default {
  async fetch(request, env, ctx) {
    try {
      const { searchParams } = new URL(request.url);
      const targetUrl = searchParams.get("url");

      if (!targetUrl) {
        return json({ success: false, error: "Missing url parameter" }, 400);
      }

      // Validate URL
      try {
        new URL(targetUrl);
      } catch {
        return json({ success: false, error: "Invalid URL format" }, 400);
      }

      // Strict domain validation
      if (!/^https:\/\/(www\.)?latinporn\.vip\//i.test(targetUrl)) {
        return json({ success: false, error: "Invalid domain" }, 400);
      }

      // Check cache
      const cache = caches.default;
      const cacheKey = new Request(request.url, request);
      const cachedResponse = await cache.match(cacheKey);
      
      if (cachedResponse) {
        return cachedResponse;
      }

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return json({ 
          success: false, 
          error: `Failed to fetch: ${res.status}` 
        }, res.status);
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('text/html')) {
        return json({ success: false, error: "Not an HTML page" }, 400);
      }

      const html = await res.text();

      // Extract metadata with more robust patterns
      const thumb = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] ||
                    html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i)?.[1] || null;

      const title = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
                    html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1] || null;

      const video = html.match(/source\s+src=["']([^"']+\.mp4[^"']*)["']/i)?.[1] ||
                    html.match(/"file":"([^"]+\.mp4[^"]*)"/i)?.[1] ||
                    html.match(/https?:\/\/[^"'<\s]+\.mp4[^"'<\s]*/i)?.[0] || null;

      const response = json({
        success: true,
        file_name: title,
        thumbnail: thumb,
        download: video,
      });

      // Cache for 1 hour
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;

    } catch (err) {
      if (err.name === 'AbortError') {
        return json({ success: false, error: "Request timeout" }, 504);
      }
      return json({ success: false, error: err.message }, 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}