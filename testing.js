// TikTok Downloader for Cloudflare Worker
// Original Python FastAPI code converted to Cloudflare Worker

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    
    // Route handling
    if (url.pathname === '/tik/dl' && request.method === 'GET') {
      const tiktokUrl = url.searchParams.get('url');
      return await handleTikTokDownload(tiktokUrl);
    }

    // 404 for other routes
    return new Response('Not Found', { status: 404 });
  },
};

async function handleTikTokDownload(tiktokUrl) {
  // Validate URL
  if (!tiktokUrl || !tiktokUrl.startsWith('https://www.tiktok.com/')) {
    return jsonResponse(
      {
        success: false,
        error: 'Invalid or missing TikTok URL',
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz',
      },
      400
    );
  }

  try {
    const htmlContent = await fetchTikTokData(tiktokUrl);
    
    if (!htmlContent) {
      return jsonResponse(
        {
          success: false,
          error: 'Failed to fetch TikTok data',
          api_owner: '@ISmartCoder',
          api_updates: 't.me/abirxdhackz',
        },
        500
      );
    }

    // Extract snapcdn.app links
    const downloadLinks = [];
    const filenames = [];
    
    // Regular expression to find snapcdn links
    const linkRegex = /href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)"/g;
    let match;
    
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      const link = match[1];
      downloadLinks.push(link);
      
      // Extract filename from token
      const filename = extractFilenameFromToken(link, tiktokUrl);
      filenames.push(sanitizeFilename(filename));
    }

    if (downloadLinks.length === 0) {
      return jsonResponse(
        {
          success: false,
          error: 'No downloadable links found',
          api_owner: '@ISmartCoder',
          api_updates: 't.me/abirxdhackz',
        },
        404
      );
    }

    // Prepare result
    const result = downloadLinks.map((link, index) => ({
      url: link,
      filename: filenames[index],
    }));

    return jsonResponse(
      {
        success: true,
        links: result,
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz',
      },
      200
    );
  } catch (error) {
    console.error(`Error processing TikTok URL ${tiktokUrl}:`, error);
    
    return jsonResponse(
      {
        success: false,
        error: `Unexpected error: ${error.message}`,
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz',
      },
      500
    );
  }
}

async function fetchTikTokData(url) {
  const API_URL = 'https://tikdownloader.io/api/ajaxSearch';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://tikdownloader.io/',
    Origin: 'https://tikdownloader.io',
  };

  const payload = new URLSearchParams({
    q: url,
    lang: 'en',
  });

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: headers,
      body: payload.toString(),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status !== 'ok' || !data.data) {
      throw new Error('API returned invalid status or no data');
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching TikTok data:', error);
    throw error;
  }
}

function extractFilenameFromToken(link, originalUrl) {
  try {
    const urlObj = new URL(link);
    const token = urlObj.searchParams.get('token');
    
    if (!token) {
      return `TikTok_${originalUrl.split('/').pop() || 'video'}`;
    }

    // Decode JWT-like token (split and decode payload)
    const parts = token.split('.');
    if (parts.length < 2) {
      return `TikTok_${originalUrl.split('/').pop() || 'video'}`;
    }

    // Base64 decode the payload part
    let payload = parts[1];
    // Add padding if needed
    payload += '='.repeat((4 - (payload.length % 4)) % 4);
    
    const decoded = atob(payload);
    const jsonData = JSON.parse(decoded);
    
    return jsonData.filename || `TikTok_${originalUrl.split('/').pop() || 'video'}`;
  } catch (error) {
    console.error('Error extracting filename from token:', error);
    return `TikTok_${originalUrl.split('/').pop() || 'video'}`;
  }
}

function sanitizeFilename(filename) {
  // Remove query parameters
  filename = filename.split('?')[0];
  
  // Remove invalid characters
  filename = filename.replace(/[<>:"/\\|?*]/g, '_');
  
  // Replace multiple underscores with single
  filename = filename.replace(/_+/g, '_');
  
  // Trim underscores from start and end
  filename = filename.replace(/^_+|_+$/g, '');
  
  // Ensure file extension
  if (!filename.toLowerCase().endsWith('.mp4') && !filename.toLowerCase().endsWith('.mp3')) {
    filename += '.mp4';
  }
  
  return filename;
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}