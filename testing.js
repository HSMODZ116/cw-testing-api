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
      
      // Check if this is TikTok endpoint
      if (url.pathname === '/tik/dl') {
        const tiktokUrl = url.searchParams.get('url');

        if (!tiktokUrl) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Missing TikTok URL parameter',
              api_owner: '@ISmartCoder',
              api_updates: 't.me/abirxdhackz'
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

        // Validate TikTok URL
        if (!tiktokUrl.startsWith('https://www.tiktok.com/')) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Invalid TikTok URL',
              api_owner: '@ISmartCoder',
              api_updates: 't.me/abirxdhackz'
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

        // Fetch TikTok data
        const result = await fetchTikTokData(tiktokUrl);
        
        if (!result.success) {
          const status = result.error?.toLowerCase().includes('timeout') ? 504 : 500;
          return new Response(
            JSON.stringify({
              success: false,
              error: result.error,
              api_owner: '@ISmartCoder',
              api_updates: 't.me/abirxdhackz'
            }),
            {
              status: status,
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
            links: result.links,
            api_owner: '@ISmartCoder',
            api_updates: 't.me/abirxdhackz'
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
      }

      // Default response for other paths
      return new Response(
        JSON.stringify({
          error: 'Use /tik/dl?url=YOUR_TIKTOK_URL',
          endpoints: {
            tiktok: '/tik/dl?url='
          },
          api_owner: '@ISmartCoder',
          api_updates: 't.me/abirxdhackz'
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Server error: ${error.message}`,
          api_owner: '@ISmartCoder',
          api_updates: 't.me/abirxdhackz'
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

// Function to fetch TikTok data
async function fetchTikTokData(tiktokUrl) {
  const API_URL = 'https://tikdownloader.io/api/ajaxSearch';
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://tikdownloader.io/',
    'Origin': 'https://tikdownloader.io'
  };

  try {
    const formData = new URLSearchParams();
    formData.append('q', tiktokUrl);
    formData.append('lang', 'en');

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: HEADERS,
      body: formData,
      timeout: 10000 // 10 second timeout
    });

    if (!response.ok) {
      return { 
        success: false, 
        error: `API request failed: ${response.status}` 
      };
    }

    const data = await response.json();
    
    if (data.status !== 'ok' || !data.data) {
      return { 
        success: false, 
        error: 'API returned invalid status or no data' 
      };
    }

    // Extract snapcdn.app links
    const downloadLinks = [];
    const filenames = [];
    
    // Regular expression to find snapcdn.app links
    const linkRegex = /href="(https:\/\/dl\.snapcdn\.app\/get\?token=[^"]+)"/g;
    let match;
    
    while ((match = linkRegex.exec(data.data)) !== null) {
      const link = match[1];
      downloadLinks.push(link);
      
      // Extract filename from token
      const filename = extractFilenameFromToken(link, tiktokUrl);
      filenames.push(sanitizeFilename(filename));
    }

    if (downloadLinks.length === 0) {
      return { 
        success: false, 
        error: 'No downloadable links found' 
      };
    }

    // Combine links with filenames
    const links = downloadLinks.map((link, index) => ({
      url: link,
      filename: filenames[index]
    }));

    return {
      success: true,
      links: links
    };

  } catch (error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return { success: false, error: 'Request timed out' };
    }
    return { success: false, error: `Connection error: ${error.message}` };
  }
}

// Function to extract filename from token
function extractFilenameFromToken(link, tiktokUrl) {
  try {
    const urlObj = new URL(link);
    const token = urlObj.searchParams.get('token');
    
    if (token) {
      // Split token and decode payload
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
          return decoded.filename;
        }
      }
    }
  } catch (e) {
    // Silently fail and use fallback
  }
  
  // Fallback filename
  const videoId = tiktokUrl.split('/').pop() || 'video';
  return `TikTok_${videoId}`;
}

// Function to sanitize filename
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
  
  return filename;
}