export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      
      // Route: /info - Get video info
      if (url.pathname === "/info") {
        const { searchParams } = url;
        const targetUrl = searchParams.get("url");

        // ❌ missing url
        if (!targetUrl) {
          return json({ success: false, error: "Missing url parameter" }, 400);
        }

        // 🔒 allow only target site
        if (!/^https?:\/\/(www\.)?latinporn\.vip\//i.test(targetUrl)) {
          return json({ success: false, error: "Invalid domain" }, 400);
        }

        // 🌐 fetch page (IMPORTANT HEADERS)
        const res = await fetch(targetUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://latinporn.vip/",
            "Accept-Language": "en-US,en;q=0.9",
          },
          redirect: "follow",
        });

        const html = await res.text();

        // 📸 thumbnail
        const thumb =
          html.match(/property="og:image"\s*content="([^"]+)"/i)?.[1] || null;

        // 📝 title
        const title =
          html.match(/property="og:title"\s*content="([^"]+)"/i)?.[1] || null;

        // 🎬 stronger mp4 extraction
        let video =
          html.match(/source[^>]+src="([^"]+\.mp4[^"]*)"/i)?.[1] ||
          html.match(/["']file["']\s*:\s*["']([^"']+\.mp4[^"']*)/i)?.[1] ||
          html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/i)?.[0] ||
          null;

        // 🔧 normalize protocol
        if (video && video.startsWith("//")) {
          video = "https:" + video;
        }

        // Generate streaming URL
        const streamingUrl = video ? `${url.origin}/download?url=${encodeURIComponent(video)}&file_name=${encodeURIComponent(title || "video.mp4")}` : null;

        return json({
          success: true,
          file_name: title,
          thumbnail: thumb,
          download: video,
          streaming_url: streamingUrl,
        });
      }
      
      // =============================
      // 🔹 Route: /download - Stream video
      // =============================
      if (url.pathname === "/download") {
        const target = url.searchParams.get("url");
        const fileName = url.searchParams.get("file_name") || "video.mp4";
        const range = request.headers.get("Range");

        if (!target) {
          return new Response("❌ Missing 'url' parameter", { status: 400 });
        }

        // Fetch the video with range support for streaming
        const videoResponse = await fetch(target, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Range": range || "", // Pass through range header for seeking
          },
        });

        // Create response with proper headers for streaming
        const responseHeaders = new Headers(videoResponse.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Content-Disposition", `attachment; filename="${fileName}"`);
        responseHeaders.set("Cache-Control", "public, max-age=86400");

        return new Response(videoResponse.body, {
          status: videoResponse.status,
          statusText: videoResponse.statusText,
          headers: responseHeaders,
        });
      }

      // 404 for other routes
      return new Response("Not found", { status: 404 });

    } catch (err) {
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
    },
  });
}