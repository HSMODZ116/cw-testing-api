// TikTok Video Downloader for Cloudflare Worker
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
      const tiktokUrl = url.searchParams.get('url');

      if (!tiktokUrl) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing 'url' query parameter",
            example: "/?url=https://www.tiktok.com/@username/video/123456789",
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

      // Normalize and validate TikTok URL
      const normalizedUrl = await normalizeTikTokUrl(tiktokUrl);
      
      if (!isValidTikTokUrl(normalizedUrl)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid TikTok URL! Only TikTok URLs are supported.',
            example: "https://www.tiktok.com/@username/video/123456789",
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

      // Fetch video data from tikdownloader.io
      const videoData = await fetchTikTokVideo(normalizedUrl);

      if (!videoData.success) {
        return new Response(
          JSON.stringify({
            success: false,
            error: videoData.error,
            api_owner: 'Haseeb Sahil',
            api_updates: 't.me/hsmodzofc2',
          }),
          {
            status: videoData.status || 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          video: videoData,
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
          success: false,
          error: `Server error: ${error.message}`,
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

// TikTok API configuration
const TIKTOK_API = {
  URL: 'https://tikdownloader.io/api/ajaxSearch',
  HEADERS: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://tikdownloader.io/',
    'Origin': 'https://tikdownloader.io'
  }
};

// Normalize TikTok URL (handle short links, etc.)
async function normalizeTikTokUrl(url) {
  let normalized = url.trim();
  
  // Add https:// if missing
  if (!normalized.startsWith('http')) {
    normalized = 'https://' + normalized;
  }
  
  // Resolve short URLs (vt.tiktok.com, vm.tiktok.com)
  if (normalized.includes('vt.tiktok.com') || normalized.includes('vm.tiktok.com')) {
    try {
      const response = await fetch(normalized, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent': TIKTOK_API.HEADERS['User-Agent']
        }
      });
      return response.url || normalized;
    } catch {
      return normalized;
    }
  }
  
  return normalized;
}

// Validate TikTok URL
function isValidTikTokUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check if it's a TikTok domain
    return hostname.includes('tiktok.com') || 
           hostname.includes('vt.tiktok.com') || 
           hostname.includes('vm.tiktok.com');
  } catch {
    return false;
  }
}

// Fetch TikTok video data
async function fetchTikTokVideo(tiktokUrl) {
  try {
    const formData = new URLSearchParams();
    formData.append('q', tiktokUrl);
    formData.append('lang', 'en');

    const response = await fetch(TIKTOK_API.URL, {
      method: 'POST',
      headers: TIKTOK_API.HEADERS,
      body: formData,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `API request failed: HTTP ${response.status}`,
        status: 502
      };
    }

    const data = await response.json();
    
    if (data.status !== 'ok' || !data.data) {
      return {
        success: false,
        error: 'API returned invalid status or no data',
        status: 500
      };
    }

    // Extract video information from HTML
    const videoInfo = extractTikTokVideoInfo(data.data, tiktokUrl);
    
    if (!videoInfo.videos || videoInfo.videos.length === 0) {
      return {
        success: false,
        error: 'No downloadable videos found',
        status: 404
      };
    }

    return {
      success: true,
      ...videoInfo
    };

  } catch (error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return {
        success: false,
        error: 'Request timed out',
        status: 504
      };
    }
    return {
      success: false,
      error: `Connection error: ${error.message}`,
      status: 500
    };
  }
}

// Extract TikTok video information from HTML
function extractTikTokVideoInfo(html, originalUrl) {
  // Extract video title/description
  let title = 'TikTok Video';
  const titlePatterns = [
    /<h2[^>]*class="[^"]*video-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
    /<title>(.*?)<\/title>/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]+)"[^>]*>/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const extractedTitle = stripTags(match[1]);
      if (extractedTitle && !extractedTitle.includes('TikTok')) {
        title = extractedTitle.substring(0, 100); // Limit title length
        break;
      }
    }
  }

  // Extract thumbnail
  let thumbnail = null;
  const thumbPatterns = [
    /<img[^>]*class="[^"]*video-thumb[^"]*"[^>]*src="([^"]+)"/i,
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i,
    /<img[^>]*src="([^"]+)"[^>]*id="[^"]*thumbnail[^"]*"/i
  ];
  
  for (const pattern of thumbPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const thumbSrc = match[1].trim();
      if (thumbSrc.startsWith('http')) {
        thumbnail = thumbSrc;
        break;
      }
    }
  }

  // Extract author information
  let author = 'Unknown';
  const authorPatterns = [
    /<h3[^>]*class="[^"]*author-name[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
    /<p[^>]*class="[^"]*username[^"]*"[^>]*>@?([\s\S]*?)<\/p>/i,
    /<meta[^>]*property="og:video:actor"[^>]*content="([^"]+)"[^>]*>/i
  ];
  
  for (const pattern of authorPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      author = stripTags(match[1]).replace('@', '').trim();
      break;
    }
  }

  // Extract video duration
  let duration = null;
  const durationPatterns = [
    /<span[^>]*class="[^"]*video-duration[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    /<meta[^>]*property="video:duration"[^>]*content="([^"]+)"[^>]*>/i
  ];
  
  for (const pattern of durationPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      duration = stripTags(match[1]);
      break;
    }
  }

  // Extract download links (focus on snapcdn.app to avoid 403 errors)
  const videos = [];
  const snapLinks = new Set();
  
  // Pattern for snapcdn.app links
  const snapPattern = /href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)"/gi;
  let match;
  
  while ((match = snapPattern.exec(html)) !== null) {
    const link = match[1];
    if (!snapLinks.has(link)) {
      snapLinks.add(link);
      
      // Determine quality from filename or token
      let quality = 'Unknown';
      const filename = extractFilenameFromToken(link);
      
      if (filename) {
        if (filename.includes('HD') || filename.includes('720p') || filename.includes('1080p')) {
          quality = 'HD';
        } else if (filename.includes('SD') || filename.includes('360p') || filename.includes('480p')) {
          quality = 'SD';
        } else if (link.includes('watermark')) {
          quality = 'With Watermark';
        } else {
          quality = 'Without Watermark';
        }
      } else {
        // Default quality based on order
        quality = snapLinks.size === 1 ? 'Without Watermark' : 'With Watermark';
      }
      
      videos.push({
        quality: quality,
        url: link,
        filename: filename || sanitizeFilename(`TikTok_${Date.now()}.mp4`)
      });
    }
  }

  // If no snapcdn links found, try alternative patterns
  if (videos.length === 0) {
    // Look for any mp4 links
    const mp4Pattern = /<a[^>]*href="([^"]+\.mp4[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    
    while ((match = mp4Pattern.exec(html)) !== null) {
      const link = match[1];
      if (link.includes('tiktok') || link.includes('video')) {
        videos.push({
          quality: match[2] ? stripTags(match[2]) : 'Unknown',
          url: link,
          filename: sanitizeFilename(`TikTok_${Date.now()}.mp4`)
        });
      }
    }
  }

  return {
    title: title,
    author: author,
    thumbnail: thumbnail,
    duration: duration,
    videos: videos,
    total_videos: videos.length,
    original_url: originalUrl
  };
}

// Extract filename from token
function extractFilenameFromToken(snapUrl) {
  try {
    const urlObj = new URL(snapUrl);
    const token = urlObj.searchParams.get('token');
    
    if (token) {
      const parts = token.split('.');
      if (parts.length >= 2) {
        let payloadPart = parts[1];
        // Add padding if needed
        while (payloadPart.length % 4) {
          payloadPart += '=';
        }
        
        // Decode base64
        const decodedStr = atob(payloadPart);
        const decoded = JSON.parse(decodedStr);
        
        if (decoded.filename) {
          return sanitizeFilename(decoded.filename);
        }
      }
    }
  } catch (e) {
    // Silently fail
  }
  return null;
}

// Sanitize filename
function sanitizeFilename(filename) {
  // Remove query parameters
  filename = filename.split('?')[0];
  
  // Remove invalid characters
  filename = filename.replace(/[<>:"/\\|?*]/g, '_');
  
  // Replace multiple underscores with single
  filename = filename.replace(/_+/g, '_');
  
  // Remove leading/trailing underscores
  filename = filename.replace(/^_+|_+$/g, '');
  
  // Ensure .mp4 extension
  if (!filename.toLowerCase().endsWith('.mp4')) {
    filename += '.mp4';
  }
  
  return filename || 'tiktok_video.mp4';
}

// Strip HTML tags
function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}