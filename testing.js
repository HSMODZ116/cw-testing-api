// Cloudflare Worker for YouTube Downloader & Search
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
      const videoUrl = url.searchParams.get('url') || '';

      // Route handling
      if (path === '/yt/search' || path === '/search') {
        return await handleSearch(query);
      } else if (path === '/yt/dl' || path === '/dl') {
        return await handleDownload(videoUrl);
      } else {
        return new Response(
          JSON.stringify({
            error: 'Invalid endpoint',
            available_endpoints: {
              search: '/yt/search?query=',
              download: '/yt/dl?url='
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
          error: `Server error: ${error.message}`,
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
        example: '/yt/search?query=',
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
          error: searchData.error,
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
        error: `Search failed: ${error.message}`,
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

// Handle download endpoint
async function handleDownload(videoUrl) {
  if (!videoUrl) {
    return new Response(
      JSON.stringify({
        error: "Missing 'url' parameter.",
        example: '/yt/dl?url=',
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

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return new Response(
      JSON.stringify({
        error: 'Invalid YouTube URL.',
        example: 'https://youtube.com/watch?v=VIDEO_ID',
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

  const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Fetch YouTube details
  let youtubeData = await fetchYouTubeDetails(videoId);
  
  if (youtubeData.error) {
    youtubeData = {
      title: 'Unavailable',
      channel: 'N/A',
      description: 'N/A',
      tags: [],
      imageUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: 'N/A',
      views: 'N/A',
      likes: 'N/A',
      comments: 'N/A'
    };
  }

  try {
    // Fetch from Clipto API
    const cliptoResponse = await fetch('https://www.clipto.com/api/youtube', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: standardUrl })
    });

    const response = {
      api_owner: 'Haseeb Sahil',
      api_updates: 't.me/hsmodzofc2'
    };

    if (cliptoResponse.ok) {
      const cliptoData = await cliptoResponse.json();
      
      response.title = decodeHtmlEntities(cliptoData.title || youtubeData.title);
      response.channel = youtubeData.channel;
      response.description = youtubeData.description;
      response.tags = youtubeData.tags;
      response.thumbnail = cliptoData.thumbnail || youtubeData.imageUrl;
      response.thumbnail_url = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      response.url = cliptoData.url || standardUrl;
      response.duration = youtubeData.duration;
      response.views = youtubeData.views;
      response.likes = youtubeData.likes;
      response.comments = youtubeData.comments;

      // Add any additional fields from clipto
      Object.keys(cliptoData).forEach(key => {
        if (!response[key]) {
          response[key] = cliptoData[key];
        }
      });
    } else {
      response.title = youtubeData.title;
      response.channel = youtubeData.channel;
      response.description = youtubeData.description;
      response.tags = youtubeData.tags;
      response.thumbnail = youtubeData.imageUrl;
      response.thumbnail_url = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      response.url = standardUrl;
      response.duration = youtubeData.duration;
      response.views = youtubeData.views;
      response.likes = youtubeData.likes;
      response.comments = youtubeData.comments;
      response.error = 'Failed to fetch download URL from Clipto API.';
      
      return new Response(JSON.stringify(response, null, 2), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        api_owner: 'Haseeb Sahil',
        api_updates: 't.me/hsmodzofc2',
        title: youtubeData.title,
        channel: youtubeData.channel,
        description: youtubeData.description,
        tags: youtubeData.tags,
        thumbnail: youtubeData.imageUrl,
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        url: standardUrl,
        duration: youtubeData.duration,
        views: youtubeData.views,
        likes: youtubeData.likes,
        comments: youtubeData.comments,
        error: 'Something went wrong. Please contact Haseeb Sahil and report the bug.'
      }, null, 2),
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

// Extract video ID from YouTube URL
function extractVideoId(url) {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&?\s]+)/,
    /(?:https?:\/\/)?youtu\.be\/([^&?\s]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&?\s]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^&?\s]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^&?\s]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  const queryMatch = url.match(/v=([^&?\s]+)/);
  return queryMatch ? queryMatch[1] : null;
}

// Parse duration string to readable format
function parseDuration(durationStr) {
  if (!durationStr) return 'N/A';
  
  try {
    const parts = durationStr.split(':');
    let hours = 0, minutes = 0, seconds = 0;
    
    if (parts.length === 3) {
      [hours, minutes, seconds] = parts.map(Number);
    } else if (parts.length === 2) {
      [minutes, seconds] = parts.map(Number);
    } else if (parts.length === 1) {
      seconds = Number(parts[0]);
    }
    
    let formatted = '';
    if (hours > 0) formatted += `${hours}h `;
    if (minutes > 0) formatted += `${minutes}m `;
    if (seconds > 0) formatted += `${seconds}s`;
    
    return formatted.trim() || '0s';
  } catch {
    return 'N/A';
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

// Fetch YouTube video details using public API
async function fetchYouTubeDetails(videoId) {
  try {
    // Using public API as replacement for py_yt
    const response = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch video details');
    }
    
    const data = await response.json();
    
    return {
      title: decodeHtmlEntities(data.title || 'N/A'),
      channel: data.uploader || 'N/A',
      description: decodeHtmlEntities(data.description || 'N/A'),
      tags: data.tags || [],
      imageUrl: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: formatDuration(data.duration || 0),
      views: formatNumber(data.views || 0),
      likes: formatNumber(data.likes || 0),
      comments: formatNumber(data.comments || 0)
    };
  } catch (error) {
    console.error('Error fetching YouTube details:', error);
    return { error: 'Failed to fetch video details' };
  }
}

// Fetch YouTube search results
async function fetchYouTubeSearch(query) {
  try {
    const response = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch search results');
    }
    
    const data = await response.json();
    
    return data.items.map(item => ({
      title: decodeHtmlEntities(item.title || 'N/A'),
      channel: item.uploader || 'N/A',
      tags: [],
      imageUrl: item.thumbnail || `https://img.youtube.com/vi/${item.url?.split('=')[1] || ''}/hqdefault.jpg`,
      link: `https://youtube.com/watch?v=${item.url?.split('=')[1] || ''}`,
      duration: formatDuration(item.duration || 0),
      views: formatNumber(item.views || 0),
      likes: 'N/A',
      comments: 'N/A'
    }));
  } catch (error) {
    console.error('Error fetching search results:', error);
    return { error: 'Failed to fetch search results' };
  }
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

// Format large numbers (e.g., 1.2K, 1.5M)
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