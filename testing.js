// Worker code - save as index.js
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

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Only GET method is allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Allow': 'GET',
        },
      });
    }

    try {
      // Get the prompt from URL query parameters
      const url = new URL(request.url);
      const prompt = url.searchParams.get('prompt');
      
      if (!prompt) {
        return new Response(JSON.stringify({ error: 'Prompt is required. Use ?prompt=your+prompt+here' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Cookies from your Python code
      const cookies = {
        'cfzs_google-analytics_v4': '%7B%22eKJd_pageviewCounter%22%3A%7B%22v%22%3A%221%22%7D%7D',
        'cfz_google-analytics_v4': '%7B%22eKJd_engagementDuration%22%3A%7B%22v%22%3A%226525%22%2C%22e%22%3A1788077261653%7D%2C%22eKJd_engagementStart%22%3A%7B%22v%22%3A%221756541261653%22%2C%22e%22%3A1788077261653%7D%2C%22eKJd_counter%22%3A%7B%22v%22%3A%2224%22%2C%22e%22%3A1788077255128%7D%2C%22eKJd_session_counter%22%3A%7B%22v%22%3A%225%22%2C%22e%22%3A1788077255128%7D%2C%22eKJd_ga4%22%3A%7B%22v%22%3A%22ca660850-065a-4047-aab4-498e6995c0c7%22%2C%22e%22%3A1788077255128%7D%2C%22eKJd_let%22%3A%7B%22v%22%3A%221756541255128%22%2C%22e%22%3A1788077255128%7D%2C%22eKJd_ga4sid%22%3A%7B%22v%22%3A%221871711808%22%2C%22e%22%3A1756543055128%7D%7D',
      };

      // Convert cookies object to string
      const cookieString = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

      // Headers from your Python code
      const headers = {
        'authority': 'fluxai.pro',
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'origin': 'https://fluxai.pro',
        'pragma': 'no-cache',
        'referer': 'https://fluxai.pro/fast-flux',
        'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        'cookie': cookieString,
      };

      // Make the POST request to Flux AI (even though our worker uses GET)
      const response = await fetch('https://fluxai.pro/api/tools/fast', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ prompt: prompt }),
      });

      // Get the response text
      const responseText = await response.text();

      // Return the response
      return new Response(responseText, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      // Handle any errors
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};