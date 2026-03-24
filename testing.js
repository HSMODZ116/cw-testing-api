// Cloudflare Worker for PixWithAI Image Generator
// Deploy this to Cloudflare Workers

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    
    // Handle main request
    if (url.pathname === '/' || url.pathname === '/generate') {
      return handleGenerate(request, env);
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  },
};

async function handleGenerate(request, env) {
  const url = new URL(request.url);
  let prompt, ratio;
  
  // Handle both GET and POST requests
  if (request.method === 'GET') {
    prompt = url.searchParams.get('prompt');
    ratio = url.searchParams.get('ratio') || '1:1';
  } else {
    const body = await request.json().catch(() => ({}));
    prompt = body.prompt;
    ratio = body.ratio || '1:1';
  }
  
  if (!prompt) {
    return new Response(JSON.stringify({ 
      status: false, 
      error: "Parameter 'prompt' diperlukan." 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const TOKEN = env.PIXWITH_TOKEN || "a887b936b661edf25d9198bca64c3dec1";
  const BASE = "https://api.pixwith.ai";
  const UA = "Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36";

  const headers = {
    "Content-Type": "application/json",
    "x-session-token": TOKEN,
    "Origin": "https://pixwith.ai",
    "Referer": "https://pixwith.ai/",
    "User-Agent": UA
  };

  try {
    // Step 1: Create task
    const createRes = await fetch(`${BASE}/api/items/create`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        images: {},
        prompt: prompt,
        options: { 
          prompt_optimization: true, 
          num_outputs: 1, 
          aspect_ratio: ratio 
        },
        model_id: "0-0"
      })
    });
    
    if (!createRes.ok) {
      throw new Error(`Create request failed: ${createRes.status}`);
    }
    
    const createData = await createRes.json();
    if (createData.code !== 1) {
      throw new Error(createData.message || "Create failed");
    }

    // Step 2: Poll history until image is ready
    const maxAttempts = 20;
    const pollInterval = 3000; // 3 seconds
    
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(pollInterval);
      
      const histRes = await fetch(`${BASE}/api/items/history`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ 
          tool_type: "0", 
          tag: "", 
          page: 0, 
          page_size: 1 
        })
      });
      
      if (!histRes.ok) continue;
      
      const histData = await histRes.json();
      const item = histData.data?.items?.[0];
      
      if (item && item.status === 2 && item.result_urls?.length > 0) {
        // Return the result
        return new Response(JSON.stringify({
          status: true,
          creator: "Xena",
          result: {
            prompt: item.prompt,
            model: item.model_name,
            image: item.result_urls[0].hd || item.result_urls[0].url,
            created_at: item.created_at,
            ratio: ratio
          }
        }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          },
        });
      }
    }
    
    throw new Error("Timeout waiting for result - image generation taking too long");
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      status: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
    });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}