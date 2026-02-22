// Cloudflare Worker for Facebook Video Downloader (Ad-Free Version)
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    try {
      const url = new URL(request.url);
      const videoUrl = url.searchParams.get('url');

      if (!videoUrl) {
        return new Response(
          JSON.stringify({
            error: "Missing 'url' query parameter",
            api_owner: '@ISmartCoder',
            api_updates: 't.me/abirxdhackz',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      if (
        !videoUrl.includes('facebook.com') &&
        !videoUrl.includes('fb.watch') &&
        !videoUrl.includes('fb.com')
      ) {
        return new Response(
          JSON.stringify({
            error: 'Only Facebook URLs are supported!',
            api_owner: '@ISmartCoder',
            api_updates: 't.me/abirxdhackz',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2434 Build/AP3A.240905.015.A2_NN_V000L1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.35 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Origin': 'https://fdown.net',
        'Referer': 'https://fdown.net/',
        'Upgrade-Insecure-Requests': '1',
      };

      const formData = new FormData();
      formData.append('URLz', videoUrl.trim());

      const response = await fetch('https://fdown.net/download.php', {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: 'Third-party service temporarily down',
            api_owner: '@ISmartCoder',
            api_updates: 't.me/abirxdhackz',
          }),
          {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      const html = await response.text();
      const videoInfo = extractVideoInfo(html);

      if (!videoInfo.links || videoInfo.links.length === 0) {
        return new Response(
          JSON.stringify({
            error: 'No downloadable links found',
            api_owner: '@ISmartCoder',
            api_updates: 't.me/abirxdhackz',
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          links: videoInfo.links,
          total_links: videoInfo.links.length,
          api_owner: '@ISmartCoder',
          api_updates: 't.me/abirxdhackz',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: `Server error: ${error.message}`,
          api_owner: '@ISmartCoder',
          api_updates: 't.me/abirxdhackz',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};

function extractVideoInfo(html) {
  let title = 'Facebook Video';
  const titleMatch = html.match(/<div class="lib-row lib-header">(.*?)<\/div>/i);
  if (titleMatch && titleMatch[1]) {
    const extractedTitle = titleMatch[1].trim();
    if (extractedTitle && extractedTitle !== 'No video title') {
      title = extractedTitle;
    }
  }

  let thumbnail = null;
  const thumbMatch = html.match(/<img class="lib-img-show"[^>]*src="([^"]+)"/i);
  if (thumbMatch && thumbMatch[1]) {
    const thumbSrc = thumbMatch[1];
    if (!thumbSrc.includes('no-thumbnail-fbdown.png')) {
      thumbnail = thumbSrc;
    }
  }

  const links = [];
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let linkMatch;

  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = linkMatch[1];
    const text = linkMatch[2].replace(/<[^>]*>/g, '').trim();

    // Filter out ads and only keep actual video links
    if (href && 
        (href.includes('fbcdn.net') || href.includes('.mp4')) && 
        !href.includes('chrome.google.com') &&
        !text.toLowerCase().includes('extension')) {
      
      let quality = 'Unknown';
      
      if (text.toLowerCase().includes('hd') || text.toLowerCase().includes('high') || href.includes('hd')) {
        quality = 'HD';
      } else if (text.toLowerCase().includes('sd') || text.toLowerCase().includes('normal') || text.toLowerCase().includes('low')) {
        quality = 'SD';
      } else if (text) {
        quality = text;
      }

      if (href.startsWith('http')) {
        links.push({ quality, url: href });
      }
    }
  }

  // Remove duplicates
  const seen = new Set();
  const uniqueLinks = [];
  for (const item of links) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      uniqueLinks.push(item);
    }
  }

  return {
    title,
    thumbnail,
    links: uniqueLinks,
  };
}