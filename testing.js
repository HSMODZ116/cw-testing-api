// Cloudflare Worker for NananaV2 AI - Image to Image Transformation
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
    const prompt = url.searchParams.get('q');

    // Validation
    if (!imageUrl) {
      return jsonResponse({
        success: false,
        error: 'Image URL parameter "url" is required.',
        example: 'https://your-worker.workers.dev/?url=https://example.com/image.jpg&q=make it anime style',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    if (!prompt) {
      return jsonResponse({
        success: false,
        error: 'Prompt parameter "q" is required.',
        example: 'anime style, cartoon, realistic, etc.',
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
      const result = await nananaTransform(imageUrl, prompt);

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
        message: "Image transformed successfully!",
        data: {
          prompt: result.prompt,
          original: result.original,
          output: result.output,
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
  BASE_URL: 'https://nanana.app',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const utils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

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
      return new Uint8Array(buffer);
    } catch (error) {
      console.error(`Download Error: ${error.message}`);
      return null;
    }
  },

  async uploadToCloud(buffer) {
    try {
      const filename = `nanana-${crypto.randomUUID()}.png`;
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

async function nananaTransform(imageUrl, prompt) {
  try {
    const headers = {
      'User-Agent': CONFIG.USER_AGENT,
      'Content-Type': 'application/json',
      'Origin': 'https://nanana.app',
      'Referer': 'https://nanana.app/',
      'Accept': 'application/json, text/plain, */*'
    };

    // Step 1: Create transformation job
    console.log('Step 1: Creating transformation job...');
    console.log(`Prompt: ${prompt}`);
    console.log(`Image URL: ${imageUrl}`);
    
    const createPayload = {
      prompt: prompt,
      image_urls: [imageUrl]
    };

    const createResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/image-to-image`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(createPayload)
    });

    if (!createResult.success) {
      console.log('Create job failed:', createResult);
      return { 
        success: false, 
        error: 'Failed to create transformation job',
        details: createResult.raw || createResult.error
      };
    }

    const requestId = createResult.data?.request_id;
    if (!requestId) {
      return { 
        success: false, 
        error: 'No request ID received',
        details: createResult.data
      };
    }

    console.log('Job created, Request ID:', requestId);

    // Step 2: Poll for result
    console.log('Step 2: Waiting for result...');
    let result = null;
    const maxAttempts = 25;
    
    for (let i = 0; i < maxAttempts; i++) {
      await utils.delay(4000);
      
      const checkPayload = {
        requestId: requestId,
        type: 'image-to-image'
      };

      const checkResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/get-result`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(checkPayload)
      });

      console.log(`Attempt ${i + 1}/${maxAttempts}:`, checkResult.data?.completed ? 'Completed' : 'Processing');
      
      if (checkResult.success && checkResult.data?.completed) {
        result = checkResult.data;
        console.log('Transformation completed!');
        break;
      }
    }

    if (!result) {
      return { 
        success: false, 
        error: `Processing timeout after ${maxAttempts * 4} seconds` 
      };
    }

    // Get output URL
    const outputUrl = result.image_url || result.url || result.data?.images?.[0]?.url;
    if (!outputUrl) {
      return { 
        success: false, 
        error: 'No output image URL received',
        details: result
      };
    }

    console.log('Output URL:', outputUrl);

    // Step 3: Download result and upload to cloud
    console.log('Step 3: Processing final image...');
    const resultBuffer = await utils.downloadImage(outputUrl);
    if (!resultBuffer) {
      // If can't download, return the original URL
      return {
        success: true,
        prompt: prompt,
        original: imageUrl,
        output: outputUrl
      };
    }

    const cloudUrl = await utils.uploadToCloud(resultBuffer);
    if (!cloudUrl) {
      // If upload fails, return original URL
      return {
        success: true,
        prompt: prompt,
        original: imageUrl,
        output: outputUrl
      };
    }

    return {
      success: true,
      prompt: prompt,
      original: imageUrl,
      output: cloudUrl
    };

  } catch (error) {
    console.error(`Nanana Error: ${error.message}`);
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