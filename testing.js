export default {
  async fetch(request) {
    try {
      const { searchParams } = new URL(request.url);
      const targetUrl = searchParams.get("url");

      // ❌ missing url
      if (!targetUrl) {
        return json({ success: false, error: "Missing url parameter" }, 400);
      }

      // 🔒 allow only target site
      if (!/^https?:\/\/(www\.)?latinporn\.vip\//i.test(targetUrl)) {
        return json({ success: false, error: "Invalid domain" }, 400);
      }

      // 🌐 fetch page
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const html = await res.text();

      // 📸 thumbnail
      const thumb =
        html.match(/property="og:image"\s*content="([^"]+)"/i)?.[1] || null;

      // 📝 title
      const title =
        html.match(/property="og:title"\s*content="([^"]+)"/i)?.[1] || null;

      // 🎬 mp4 extraction (multiple patterns)
      const video =
        html.match(/source\s+src="([^"]+\.mp4[^"]*)"/i)?.[1] ||
        html.match(/file":"([^"]+\.mp4[^"]*)"/i)?.[1] ||
        html.match(/https?:\/\/[^"' ]+\.mp4[^"' ]*/i)?.[0] ||
        null;

      return json({
        success: true,
        file_name: title,
        thumbnail: thumb,
        download: video,
      });
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