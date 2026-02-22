// Cloudflare Worker for YouTube Search Only
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
      const path = url.pathname;
      const query = url.searchParams.get('query') || '';

      // Only handle search endpoint
      if (path === '/yt/search' || path === '/search') {
        return await handleSearch(query);
      } else {
        return new Response(
          JSON.stringify({
            error: 'Invalid endpoint. Only search is available.',
            available_endpoints: {
              search: '/yt/search?query='
            },
            api_owner: 'Haseeb Sahil',
            api_updates: 't.me/hsmodzofc2'
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
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch search results',
          api_owner: 'Haseeb Sahil',
          api_updates: 't.me/hsmodzofc2'
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

// Handle search endpoint
async function handleSearch(query) {
  if (!query) {
    return new Response(
      JSON.stringify({
        error: "Missing 'query' parameter.",
        example: '/yt/search?query=coding',
        api_owner: 'Haseeb Sahil',
        api_updates: 't.me/hsmodzofc2'
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

  try {
    const searchData = await fetchYouTubeSearch(query);
    
    if (searchData.error) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch search results',
          api_owner: 'Haseeb Sahil',
          api_updates: 't.me/hsmodzofc2'
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

    return new Response(
      JSON.stringify({
        api_owner: 'Haseeb Sahil',
        api_updates: 't.me/hsmodzofc2',
        result: searchData
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
        error: 'Failed to fetch search results',
        api_owner: 'Haseeb Sahil',
        api_updates: 't.me/hsmodzofc2'
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
}

// Decode HTML entities
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Format duration from seconds
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  let formatted = '';
  if (hours > 0) formatted += `${hours}h `;
  if (minutes > 0) formatted += `${minutes}m `;
  if (secs > 0) formatted += `${secs}s`;
  
  return formatted.trim() || '0s';
}

// Format large numbers
function formatNumber(num) {
  if (!num) return 'N/A';
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Fetch YouTube search results
async function fetchYouTubeSearch(query) {
  try {
    const response = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch search results');
    }
    
    const data = await response.json();
    
    // Extract items from response
    const items = data.items || [];
    
    return items.map(item => {
      // Extract video ID from URL
      const videoId = item.url?.split('=')[1] || '';
      
      return {
        title: decodeHtmlEntities(item.title || 'N/A'),
        channel: item.uploaderName || item.uploader || 'N/A',
        thumbnail: item.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://youtube.com/watch?v=${videoId}`,
        duration: formatDuration(item.duration || 0),
        views: formatNumber(item.views || 0),
        uploaded: item.uploaded || item.uploadedDate || 'N/A',
        description: decodeHtmlEntities(item.descriptionShort || item.description || '')
      };
    });
  } catch (error) {
    console.error('Error fetching search results:', error);
    return { error: 'Failed to fetch search results' };
  }
}