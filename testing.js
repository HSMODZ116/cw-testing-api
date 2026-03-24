// Cloudflare Worker for PixWithAI - Free Flux Dev Image Generator
// Developer: Haseeb Sahil
// Channel: @hsmodzofc2

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

    // Only allow GET requests
    if (request.method !== 'GET') {
      return jsonResponse({
        success: false,
        error: 'Method not allowed. Only GET requests are supported.',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 405);
    }

    const url = new URL(request.url);
    const prompt = url.searchParams.get('prompt');
    const ratio = url.searchParams.get('ratio') || '1:1';

    // Validation
    if (!prompt) {
      return jsonResponse({
        success: false,
        error: 'Prompt parameter is required. Please provide a prompt.',
        example: 'https://your-worker.workers.dev/?prompt=a beautiful sunset',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    // Validate prompt length
    if (prompt.length < 3) {
      return jsonResponse({
        success: false,
        error: 'Prompt must be at least 3 characters long.',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    if (prompt.length > 1000) {
      return jsonResponse({
        success: false,
        error: 'Prompt is too long. Maximum 1000 characters allowed.',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    // Validate ratio
    const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2'];
    if (!validRatios.includes(ratio)) {
      return jsonResponse({
        success: false,
        error: `Invalid ratio. Choose from: ${validRatios.join(', ')}`,
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    try {
      const result = await generateImage(prompt, ratio);

      if (!result.success) {
        return jsonResponse({
          success: false,
          error: result.error,
          developer: 'Haseeb Sahil',
          channel: '@hsmodzofc2'
        }, 500);
      }

      return jsonResponse({
        success: true,
        message: "Image generated successfully!",
        data: {
          prompt: result.prompt,
          model: result.model,
          image: result.image,
          ratio: ratio,
          created_at: result.created_at
        },
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      });

    } catch (error) {
      console.error(`API Error: ${error.message}`);
      return jsonResponse({
        success: false,
        error: 'An unexpected error occurred. Please try again later.',
        details: error.message,
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 500);
    }
  }
};

const CONFIG = {
  BASE_URL: 'https://api.pixwith.ai',
  TOKEN: 'a887b936b661edf25d9198bca64c3dec1',
  USER_AGENT: 'Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36'
};

async function generateImage(prompt, ratio) {
  const headers = {
    'Content-Type': 'application/json',
    'x-session-token': CONFIG.TOKEN,
    'Origin': 'https://pixwith.ai',
    'Referer': 'https://pixwith.ai/',
    'User-Agent': CONFIG.USER_AGENT
  };

  try {
    // Step 1: Create task
    console.log('Step 1: Creating task...');
    
    const createPayload = {
      images: {},
      prompt: prompt,
      options: { 
        prompt_optimization: true, 
        num_outputs: 1, 
        aspect_ratio: ratio 
      },
      model_id: "0-0"
    };

    const createResponse = await fetch(`${CONFIG.BASE_URL}/api/items/create`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(createPayload)
    });

    if (!createResponse.ok) {
      throw new Error(`Create task failed with status: ${createResponse.status}`);
    }

    const createData = await createResponse.json();
    console.log('Create response:', JSON.stringify(createData));

    if (createData.code !== 1) {
      throw new Error(createData.message || 'Create task failed');
    }

    // Step 2: Poll history until image is ready
    console.log('Step 2: Waiting for generation...');
    
    const maxAttempts = 30; // 30 attempts * 3 seconds = 90 seconds max
    let attempts = 0;
    let lastItem = null;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 3000)); // Wait 3 seconds

      const historyPayload = {
        tool_type: "0",
        tag: "",
        page: 0,
        page_size: 1
      };

      const historyResponse = await fetch(`${CONFIG.BASE_URL}/api/items/history`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(historyPayload)
      });

      if (!historyResponse.ok) {
        console.log(`Attempt ${attempts}: History fetch failed`);
        continue;
      }

      const historyData = await historyResponse.json();
      
      if (historyData.code !== 1) {
        console.log(`Attempt ${attempts}: Invalid response code`);
        continue;
      }

      const items = historyData.data?.items;
      if (!items || items.length === 0) {
        console.log(`Attempt ${attempts}: No items found`);
        continue;
      }

      const item = items[0];
      lastItem = item;
      
      console.log(`Attempt ${attempts}/${maxAttempts}: Status = ${item.status}`);

      // Status 2 = Completed
      if (item.status === 2 && item.result_urls && item.result_urls.length > 0) {
        // Verify the prompt matches (approx check)
        if (item.prompt === prompt || item.prompt.includes(prompt.substring(0, 30))) {
          console.log('Generation completed successfully!');
          
          return {
            success: true,
            prompt: item.prompt,
            model: item.model_name || 'Flux Dev',
            image: item.result_urls[0].hd || item.result_urls[0].url || item.result_urls[0],
            created_at: item.created_at || new Date().toISOString()
          };
        } else {
          console.log(`Prompt mismatch: expected "${prompt}", got "${item.prompt}"`);
          // Continue waiting for correct prompt
          continue;
        }
      }
      
      // Status 3 = Failed
      if (item.status === 3) {
        throw new Error('Generation failed by server');
      }
    }

    // Timeout reached
    if (lastItem) {
      return {
        success: false,
        error: `Generation timeout. Last status: ${lastItem.status}`,
        details: lastItem
      };
    }

    return {
      success: false,
      error: 'Timeout waiting for image generation'
    };

  } catch (error) {
    console.error(`Generation Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Developer': 'Haseeb Sahil',
      'X-Channel': '@hsmodzofc2'
    }
  });
}