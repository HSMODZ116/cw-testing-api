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
            example: "use this parameters /?url=",
            api_owner: 'Haseeb Sahil',
            api_updates: 't.me/hsmodzofc2',
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

      // Better URL validation using URL object
      try {
        const urlObj = new URL(videoUrl);
        const hostname = urlObj.hostname.toLowerCase();
        if (
          !hostname.includes('facebook.com') &&
          !hostname.includes('fb.watch') &&
          !hostname.includes('fb.com') &&
          !hostname.includes('m.facebook.com') &&
          !hostname.includes('mbasic.facebook.com')
        ) {
          throw new Error('Invalid Facebook URL');
        }
      } catch {
        return new Response(
          JSON.stringify({
            error: 'Only Facebook URLs are supported!',
            example: "use this parameters /?url=",
            api_owner: 'Haseeb Sahil',
            api_updates: 't.me/hsmodzofc2',
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

      // First resolve the final URL (follow redirects)
      const finalFbUrl = await resolveFinalUrl(videoUrl.trim());

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Origin': 'https://fdown.net',
        'Referer': 'https://fdown.net/',
        'Upgrade-Insecure-Requests': '1',
      };

      const formData = new FormData();
      formData.append('URLz', finalFbUrl);

      const response = await fetch('https://fdown.net/download.php', {
        method: 'POST',
        headers,
        body: formData,
        redirect: 'follow',
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: 'Third-party service temporarily down',
            example: "use this parameters /?url=",
            api_owner: 'Haseeb Sahil',
            api_updates: 't.me/hsmodzofc2',
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
            example: "use this parameters /?url=",
            api_owner: 'Haseeb Sahil',
            api_updates: 't.me/hsmodzofc2',
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
        JSON.stringify(
          {
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            links: videoInfo.links,
            total_links: videoInfo.links.length,
            api_owner: 'Haseeb Sahil',
            api_updates: 't.me/hsmodzofc2',
          },
          null,
          2
        ),
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
          example: "use this parameters /?url=",
          api_owner: 'Haseeb Sahil',
          api_updates: 't.me/hsmodzofc2',
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

// Helper function to resolve final URL
async function resolveFinalUrl(inputUrl) {
  try {
    const response = await fetch(inputUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return response.url || inputUrl;
  } catch {
    return inputUrl;
  }
}

// HTML tag stripper helper
function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Decode HTML entities (safe + minimal)
function decodeHtmlEntities(str) {
  if (!str) return str;
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Clean and validate video URL
function cleanVideoUrl(url) {
  if (!url) return null;

  // First decode HTML entities
  let cleanUrl = decodeHtmlEntities(url);

  // Remove any tracking parameters that might cause issues
  try {
    const urlObj = new URL(cleanUrl);

    // Remove fbclid and other tracking params if present
    urlObj.searchParams.delete('fbclid');
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');

    // Ensure dl=1 parameter is present for download
    if (!urlObj.searchParams.has('dl')) {
      urlObj.searchParams.set('dl', '1');
    }

    cleanUrl = urlObj.toString();
  } catch (e) {
    // If URL parsing fails, just do basic cleaning
    cleanUrl = cleanUrl.replace(/\s+/g, '');
  }

  return cleanUrl;
}

/**
 * ✅ IMPROVED QUALITY DETECTION (Full Fix)
 * Priority:
 * 1) Resolution match (360p/480p/720p/1080p)
 * 2) Audio
 * 3) SD (including specific bitrates)
 * 4) HD (including specific bitrates)
 * 5) Fallback to text (short label only)
 */
function detectQuality(text, href) {
  const safeText = String(text || '');
  const safeHref = String(href || '');

  const lowerText = safeText.toLowerCase();
  const lowerHref = safeHref.toLowerCase();

  // 1) Exact resolution first
  const resMatch =
    lowerText.match(/(?:^|\D)(360|480|720|1080)p(?:\D|$)/) ||
    lowerHref.match(/(?:^|\D)(360|480|720|1080)p(?:\D|$)/);

  if (resMatch && resMatch[1]) {
    return `${resMatch[1]}P`;
  }

  // 2) Audio
  if (lowerText.includes('audio') || lowerHref.includes('audio')) {
    return 'AUDIO';
  }

  // 3) SD first (more specific)
  const isSD =
    lowerText.includes('sd') ||
    lowerText.includes('360') ||
    lowerText.includes('480') ||
    lowerText.includes('normal') ||
    lowerText.includes('low') ||
    lowerHref.includes('sd') ||
    lowerHref.includes('360') ||
    lowerHref.includes('480') ||
    lowerHref.includes('bitrate=398648'); // your SD bitrate example

  if (isSD) return 'SD';

  // 4) HD
  const isHD =
    lowerText.includes('hd') ||
    lowerText.includes('high') ||
    lowerText.includes('720') ||
    lowerText.includes('1080') ||
    lowerHref.includes('hd') ||
    lowerHref.includes('720') ||
    lowerHref.includes('1080') ||
    lowerHref.includes('bitrate=1333998'); // your HD bitrate example

  if (isHD) return 'HD';

  // 5) Smart fallback (avoid long/random anchor text)
  const trimmed = safeText.trim();
  if (trimmed && trimmed.length <= 24) return trimmed;

  return 'Unknown';
}

function extractVideoInfo(html) {
  // Extract title
  let title = 'Facebook Video';
  const titlePatterns = [
    /<div[^>]*class="[^"]*\blib-row\b[^"]*\blib-header\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div class="lib-row lib-header">(.*?)<\/div>/i,
    /<title>(.*?)<\/title>/i,
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const extractedTitle = stripTags(match[1]);
      if (extractedTitle && !extractedTitle.toLowerCase().includes('no video title')) {
        title = extractedTitle;
        break;
      }
    }
  }

  // Extract thumbnail
  let thumbnail = null;
  const thumbPatterns = [
    /<img[^>]*class="[^"]*\blib-img-show\b[^"]*"[^>]*src="([^"]+)"/i,
    /<img class="lib-img-show"[^>]*src="([^"]+)"/i,
    /<img[^>]*src="([^"]+)"[^>]*class="[^"]*\blib-img-show\b[^"]*"/i,
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i,
  ];

  for (const pattern of thumbPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const thumbSrc = decodeHtmlEntities(match[1].trim());
      if (
        thumbSrc &&
        !thumbSrc.includes('no-thumbnail') &&
        !thumbSrc.includes('placeholder') &&
        thumbSrc.startsWith('http')
      ) {
        thumbnail = thumbSrc;
        break;
      }
    }
  }

  // Extract download links
  const links = [];
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;

  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = (linkMatch[1] || '').trim();
    const text = stripTags(linkMatch[2] || '');

    // Filter out ads and only keep actual video links
    if (
      href &&
      (href.includes('fbcdn.net') ||
        href.includes('.mp4') ||
        href.includes('video_redirect') ||
        href.includes('/download.php')) &&
      !href.includes('chrome.google.com') &&
      !href.includes('play.google.com') &&
      !href.includes('microsoft.com') &&
      !text.toLowerCase().includes('extension') &&
      !text.toLowerCase().includes('app')
    ) {
      const cleanUrl = cleanVideoUrl(href);
      if (!cleanUrl) continue;

      const quality = detectQuality(text, href);

      if (cleanUrl.startsWith('http')) {
        links.push({ quality, url: cleanUrl });
      }
    }
  }

  // Remove duplicates (compare cleaned URLs)
  const seen = new Set();
  const uniqueLinks = [];
  for (const item of links) {
    const baseUrl = item.url.split('?')[0];
    if (!seen.has(baseUrl)) {
      seen.add(baseUrl);
      uniqueLinks.push(item);
    }
  }

  // OPTIONAL: sort by quality preference
  uniqueLinks.sort((a, b) => {
    const order = ['1080P', '720P', 'HD', '480P', '360P', 'SD', 'AUDIO', 'UNKNOWN'];
    const qa = String(a.quality || 'Unknown').toUpperCase();
    const qb = String(b.quality || 'Unknown').toUpperCase();
    return order.indexOf(qa) - order.indexOf(qb);
  });

  return {
    title,
    thumbnail,
    links: uniqueLinks,
  };
}