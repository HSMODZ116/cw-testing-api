// Cloudflare Worker for Qwen AI - Image to Image Editor
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
    const imageUrl = url.searchParams.get('url');
    const prompt = url.searchParams.get('prompt');

    // Validation
    if (!imageUrl) {
      return jsonResponse({
        success: false,
        error: 'Image URL parameter "url" is required.',
        example: 'https://your-worker.workers.dev/?url=https://example.com/image.jpg&prompt=change background to beach',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    if (!prompt) {
      return jsonResponse({
        success: false,
        error: 'Prompt parameter is required.',
        example: 'change background, add sunglasses, make it sunset',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    // Validate image URL
    if (!imageUrl.startsWith('http')) {
      return jsonResponse({
        success: false,
        error: 'Only HTTP/HTTPS image URLs are supported.',
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

    if (prompt.length > 500) {
      return jsonResponse({
        success: false,
        error: 'Prompt is too long. Maximum 500 characters allowed.',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    try {
      const result = await qwenEdit(imageUrl, prompt);

      if (!result.success) {
        return jsonResponse({
          success: false,
          error: result.error,
          details: result.details,
          developer: 'Haseeb Sahil',
          channel: '@hsmodzofc2'
        }, 500);
      }

      return jsonResponse({
        success: true,
        message: "Image edited successfully!",
        data: {
          prompt_used: result.prompt_used,
          result: result.result_url,
          timestamp: new Date().toISOString()
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
  API_URL: 'https://api.dyysilence.biz.id/api/ai-image/qwen',
  API_KEY: 'dyy'
};

const utils = {
  async downloadImage(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('URL returned HTML instead of image');
      }
      
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      console.error(`Download Error: ${error.message}`);
      return null;
    }
  },

  async uploadToCloud(buffer) {
    try {
      const filename = `qwen-${crypto.randomUUID()}.png`;
      const contentType = 'image/png';
      const fileSize = buffer.byteLength;

      const uploadUrlResponse = await fetch('https://api.cloudsky.biz.id/get-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey: filename,
          contentType: contentType,
          fileSize: fileSize
        })
      });

      const { uploadUrl } = await uploadUrlResponse.json();

      await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileSize.toString(),
          'x-amz-server-side-encryption': 'AES256'
        },
        body: buffer
      });

      return `https://api.cloudsky.biz.id/file?key=${encodeURIComponent(filename)}`;
    } catch (error) {
      console.error(`Upload Error: ${error.message}`);
      return null;
    }
  },

  async makeRequest(url, options) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      
      try {
        const data = JSON.parse(text);
        return { success: response.ok, data: data, status: response.status };
      } catch (e) {
        return { 
          success: false, 
          error: 'Invalid JSON response', 
          raw: text.substring(0, 200),
          status: response.status 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

async function qwenEdit(imageUrl, prompt) {
  try {
    console.log('Qwen AI Edit Started');
    console.log(`Image URL: ${imageUrl}`);
    console.log(`Prompt: ${prompt}`);

    // Call Qwen API
    const apiUrl = `${CONFIG.API_URL}?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}&apikey=${CONFIG.API_KEY}`;
    
    const result = await utils.makeRequest(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!result.success) {
      console.log('API request failed:', result);
      return { 
        success: false, 
        error: 'Qwen AI service unavailable',
        details: result.raw || result.error
      };
    }

    const data = result.data;
    
    // Check if response has error
    if (data.error || data.status === false) {
      return { 
        success: false, 
        error: data.message || data.error || 'Qwen AI processing failed',
        details: data
      };
    }

    // Get result URL
    let resultUrl = data.result_url || data.result || data.data?.result_url;
    
    if (!resultUrl) {
      return { 
        success: false, 
        error: 'No result URL received',
        details: data
      };
    }

    console.log('Result URL:', resultUrl);

    // Optional: Download and upload to cloud for permanent storage
    // This step is optional since the API might return a direct URL
    try {
      const resultBuffer = await utils.downloadImage(resultUrl);
      if (resultBuffer) {
        const cloudUrl = await utils.uploadToCloud(resultBuffer);
        if (cloudUrl) {
          resultUrl = cloudUrl;
          console.log('Uploaded to cloud storage');
        }
      }
    } catch (uploadError) {
      console.log('Cloud upload skipped, using original URL');
    }

    return {
      success: true,
      prompt_used: data.prompt || prompt,
      result_url: resultUrl
    };

  } catch (error) {
    console.error(`Qwen Error: ${error.message}`);
    return { success: false, error: error.message };
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