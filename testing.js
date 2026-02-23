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
        if (!hostname.includes('facebook.com') && 
            !hostname.includes('fb.watch') && 
            !hostname.includes('fb.com') &&
            !hostname.includes('m.facebook.com') &&
            !hostname.includes('mbasic.facebook.com')) {
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
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
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
        headers: headers,
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
        JSON.stringify({
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          links: videoInfo.links,
          total_links: videoInfo.links.length,
          api_owner: 'Haseeb Sahil',
          api_updates: 't.me/hsmodzofc2',
        }, null, 2),
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
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

// Function to decode HTML entities in URL
function decodeHtmlEntities(str) {
  if (!str) return str;
  
  // Replace common HTML entities
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&') // Double replace for safety
    .replace(/&amp;/g, '&');
}

// Function to clean and validate video URL
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

// ✅ IMPROVED: Function to detect video quality
function detectQuality(text, href) {
  const lowerText = text.toLowerCase();
  const lowerHref = href.toLowerCase();
  
  // Priority 1: Check for HD first
  if (lowerText.includes('hd') || lowerText.includes('720p') || lowerText.includes('1080p') || 
      lowerText.includes('high') || lowerText.includes('full hd')) {
    return 'HD';
  }
  
  // Priority 2: Check for SD
  if (lowerText.includes('sd') || lowerText.includes('360p') || lowerText.includes('480p') || 
      lowerText.includes('normal') || lowerText.includes('low')) {
    return 'SD';
  }
  
  // Priority 3: Check URL for quality indicators
  if (lowerHref.includes('hd') || lowerHref.includes('720p') || lowerHref.includes('1080p')) {
    return 'HD';
  }
  
  if (lowerHref.includes('sd') || lowerHref.includes('360p') || lowerHref.includes('480p')) {
    return 'SD';
  }
  
  // Priority 4: Check bitrate (specific to fdown.net)
  if (lowerHref.includes('bitrate=')) {
    const bitrateMatch = lowerHref.match(/bitrate=(\d+)/);
    if (bitrateMatch) {
      const bitrate = parseInt(bitrateMatch[1]);
      if (bitrate > 1000000) { // More than 1 Mbps
        return 'HD';
      } else {
        return 'SD';
      }
    }
  }
  
  // Priority 5: Check for tags in URL
  if (lowerHref.includes('sd_') || lowerHref.includes('_sd')) {
    return 'SD';
  }
  
  if (lowerHref.includes('hd_') || lowerHref.includes('_hd')) {
    return 'HD';
  }
  
  // Priority 6: Default based on order (first link usually SD, second HD)
  return 'Unknown';
}

function extractVideoInfo(html) {
  // Extract title
  let title = 'Facebook Video';
  const titlePatterns = [
    /<div[^>]*class="[^"]*\blib-row\b[^"]*\blib-header\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div class="lib-row lib-header">(.*?)<\/div>/i,
    /<title>(.*?)<\/title>/i
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
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i
  ];
  
  for (const pattern of thumbPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const thumbSrc = decodeHtmlEntities(match[1].trim());
      if (thumbSrc && 
          !thumbSrc.includes('no-thumbnail') && 
          !thumbSrc.includes('placeholder') &&
          thumbSrc.startsWith('http')) {
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
    const href = linkMatch[1].trim();
    const text = stripTags(linkMatch[2]);

    // Filter out ads and only keep actual video links
    if (href && 
        (href.includes('fbcdn.net') || 
         href.includes('.mp4') || 
         href.includes('video_redirect') ||
         href.includes('/download.php')) && 
        !href.includes('chrome.google.com') &&
        !href.includes('play.google.com') &&
        !href.includes('microsoft.com') &&
        !text.toLowerCase().includes('extension') &&
        !text.toLowerCase().includes('app')) {
      
      // Clean the URL properly
      const cleanUrl = cleanVideoUrl(href);
      if (!cleanUrl) continue;
      
      // ✅ USE IMPROVED QUALITY DETECTION
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
    // Use URL without query params for duplicate detection
    const baseUrl = item.url.split('?')[0];
    if (!seen.has(baseUrl)) {
      seen.add(baseUrl);
      uniqueLinks.push(item);
    }
  }

  return {
    title,
    thumbnail,
    links: uniqueLinks,
  };
}