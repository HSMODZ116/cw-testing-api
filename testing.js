// Cloudflare Worker for AI Custom Transformer - GPT-Image-1
// Developer: Haseeb Sahil
// Channel: @hsmodzofc2
// Engine: GPT-Image-1 (Strict Custom Prompt)

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
        error: 'Image URL parameter "url" is required!',
        example: 'https://your-worker.workers.dev/?url=https://example.com/image.jpg&prompt=make it ghibli style',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    if (!prompt) {
      return jsonResponse({
        success: false,
        error: 'Prompt parameter is required! Example: prompt=make it ghibli style',
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
      const result = await convertAIImage(imageUrl, prompt);

      if (!result.success) {
        return jsonResponse({
          success: false,
          error: result.error,
          details: result.details,
          developer: 'Haseeb Sahil',
          channel: '@hsmodzofc2'
        }, 500);
      }

      // Return image as PNG
      return new Response(result.buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          'X-Developer': 'Haseeb Sahil',
          'X-Channel': '@hsmodzofc2',
          'X-Prompt': encodeURIComponent(prompt),
          'Cache-Control': 'public, max-age=3600'
        }
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
  PROXY_URL: 'https://ghibli-proxy.netlify.app/.netlify/functions/ghibli-proxy',
  USER_AGENT: 'Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
};

const utils = {
  async downloadImage(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': CONFIG.USER_AGENT
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('URL returned HTML instead of image');
      }
      
      const buffer = await response.arrayBuffer();
      return {
        buffer: new Uint8Array(buffer),
        mime: contentType || 'image/jpeg'
      };
    } catch (error) {
      console.error(`Download Error: ${error.message}`);
      return null;
    }
  },

  async uploadToCloud(buffer) {
    try {
      const filename = `aiconvert-${crypto.randomUUID()}.png`;
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

async function convertAIImage(imageUrl, prompt) {
  try {
    console.log('AI Custom Transformer Started');
    console.log(`Image URL: ${imageUrl}`);
    console.log(`Prompt: ${prompt}`);

    // Step 1: Download image and convert to base64
    console.log('Step 1: Downloading image...');
    const imageData = await utils.downloadImage(imageUrl);
    if (!imageData) {
      return { success: false, error: 'Failed to download image from URL' };
    }

    const base64Image = btoa(String.fromCharCode(...imageData.buffer));
    const mime = imageData.mime;
    const imgData = `data:${mime};base64,${base64Image}`;
    console.log('Image converted to base64');

    // Step 2: Prepare payload
    const payload = {
      image: imgData,
      model: "gpt-image-1",
      n: 1,
      prompt: prompt,
      quality: "low",
      size: "1024x1024"
    };

    // Step 3: Call Netlify Proxy
    console.log('Step 2: Calling AI API...');
    const result = await utils.makeRequest(CONFIG.PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://overchat.ai',
        'Referer': 'https://overchat.ai/',
        'User-Agent': CONFIG.USER_AGENT
      },
      body: JSON.stringify(payload)
    });

    if (!result.success) {
      console.log('API request failed:', result);
      return { 
        success: false, 
        error: 'AI service unavailable',
        details: result.raw || result.error
      };
    }

    const data = result.data;
    
    // Check if response has error
    if (!data?.success || !data?.data?.[0]?.b64_json) {
      return { 
        success: false, 
        error: data?.message || 'AI failed to process image',
        details: data
      };
    }

    // Step 4: Decode base64 result
    console.log('Step 3: Decoding result...');
    const base64Result = data.data[0].b64_json;
    const resultBuffer = Uint8Array.from(atob(base64Result), c => c.charCodeAt(0));
    
    // Optional: Upload to cloud for permanent storage
    console.log('Step 4: Uploading to cloud...');
    const cloudUrl = await utils.uploadToCloud(resultBuffer);
    
    if (cloudUrl) {
      console.log('Uploaded to cloud:', cloudUrl);
      return {
        success: true,
        buffer: resultBuffer,
        url: cloudUrl
      };
    }

    // Return buffer directly if upload fails
    return {
      success: true,
      buffer: resultBuffer,
      url: null
    };

  } catch (error) {
    console.error(`AI Convert Error: ${error.message}`);
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