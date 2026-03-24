// Cloudflare Worker for Live3D AI - Image Editor
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
    const image = url.searchParams.get('image');
    const prompt = url.searchParams.get('prompt');

    // Validation
    if (!image) {
      return jsonResponse({
        success: false,
        error: 'Image parameter is required. Please provide an image URL.',
        example: 'https://your-worker.workers.dev/?image=https://example.com/image.jpg&prompt=make him smile',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    if (!prompt) {
      return jsonResponse({
        success: false,
        error: 'Prompt parameter is required. Describe what you want to change.',
        example: 'make him smile, add sunglasses, change background',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    try {
      const result = await live3dEdit(image, prompt);

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
        message: "Image edited successfully!",
        data: {
          original_image: image,
          edited_image: result.image_url,
          prompt: prompt,
          model: "nano_banana_pro",
          timestamp: new Date().toISOString()
        },
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      });

    } catch (error) {
      console.error(`API Error: ${error.message}`);
      return jsonResponse({
        success: false,
        error: 'Service temporarily unavailable. Please try again later.',
        details: error.message,
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 503);
    }
  }
};

const CONFIG = {
  BASE_URL: 'https://app.live3d.io',
  CDN_URL: 'https://temp.live3d.io/',
  APP_ID: 'aifaceswap',
  U_ID: '1H5tRtzsBkqXcaJ',
  TH_VER: '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
  UA: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
  ORIGIN_FROM: '8f3f0c7387123ae0'
};

const utils = {
  randStr: (len) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < len; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  },

  generateSimpleHeaders: () => {
    return {
      'User-Agent': CONFIG.UA,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://live3d.io',
      'Referer': 'https://live3d.io/',
      'Content-Type': 'application/json',
      'fp': CONFIG.APP_ID,
      'theme-version': CONFIG.TH_VER
    };
  },

  generateUploadHeaders: () => {
    return {
      'User-Agent': CONFIG.UA,
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://live3d.io',
      'Referer': 'https://live3d.io/',
      'fp': CONFIG.APP_ID,
      'theme-version': CONFIG.TH_VER
    };
  },

  async downloadImage(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': CONFIG.UA
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
      const filename = `live3d-${crypto.randomUUID()}.png`;
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
          'Content-Length': fileSize.toString()
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
      
      // Check if response is HTML
      if (text.trim().startsWith('<') || text.includes('<!DOCTYPE')) {
        return { success: false, error: 'Server returned HTML error page', html: text.substring(0, 200) };
      }
      
      // Try to parse JSON
      try {
        const data = JSON.parse(text);
        return { success: true, data: data };
      } catch (e) {
        return { success: false, error: 'Invalid JSON response', raw: text.substring(0, 200) };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

async function live3dEdit(imageUrl, prompt) {
  try {
    // Step 1: Download image
    console.log('Step 1: Downloading image...');
    const imageBuffer = await utils.downloadImage(imageUrl);
    if (!imageBuffer) {
      return { success: false, error: 'Failed to download image from URL' };
    }

    // Step 2: Upload to Live3D
    console.log('Step 2: Uploading to Live3D...');
    const uploadHeaders = utils.generateUploadHeaders();
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, `upload_${Date.now()}.jpg`);
    formData.append('fn_name', 'demo-image-editor');
    formData.append('request_from', '9');
    formData.append('origin_from', CONFIG.ORIGIN_FROM);

    const uploadResult = await utils.makeRequest(`${CONFIG.BASE_URL}/aitools/upload-img`, {
      method: 'POST',
      headers: uploadHeaders,
      body: formData
    });

    if (!uploadResult.success || !uploadResult.data?.data?.path) {
      console.log('Upload failed:', uploadResult);
      return { 
        success: false, 
        error: 'Upload failed. Live3D service may be temporarily unavailable.',
        details: uploadResult.error || uploadResult.raw
      };
    }

    const remotePath = uploadResult.data.data.path;
    const fp = uploadResult.data.data.fp || CONFIG.APP_ID;
    console.log('Upload successful, path:', remotePath);

    // Step 3: Create job
    console.log('Step 3: Creating edit job...');
    const createHeaders = utils.generateSimpleHeaders();
    
    const createPayload = {
      fn_name: 'demo-image-editor',
      call_type: 3,
      input: {
        model: 'nano_banana_pro',
        source_images: [remotePath],
        prompt: prompt,
        aspect_radio: 'auto',
        request_from: 9,
      },
      request_from: 9,
      origin_from: CONFIG.ORIGIN_FROM,
    };

    const createResult = await utils.makeRequest(`${CONFIG.BASE_URL}/aitools/of/create`, {
      method: 'POST',
      headers: createHeaders,
      body: JSON.stringify(createPayload)
    });

    if (!createResult.success || !createResult.data?.data?.task_id) {
      console.log('Create job failed:', createResult);
      return { 
        success: false, 
        error: 'Failed to create edit job. Service may be busy.',
        details: createResult.error || createResult.raw
      };
    }

    const taskId = createResult.data.data.task_id;
    console.log('Task ID:', taskId);

    // Step 4: Poll for result
    console.log('Step 4: Waiting for result...');
    let result;
    let attempts = 0;
    const maxAttempts = 25;
    
    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 5000));
      
      const statusPayload = {
        task_id: taskId,
        fn_name: 'demo-image-editor',
        call_type: 3,
        request_from: 9,
        origin_from: CONFIG.ORIGIN_FROM,
      };

      const statusResult = await utils.makeRequest(`${CONFIG.BASE_URL}/aitools/of/check-status`, {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify(statusPayload)
      });

      if (statusResult.success && statusResult.data?.data) {
        result = statusResult.data.data;
        console.log(`Attempt ${attempts}: Status = ${result.status}`);
        
        if (result.status === 2 && result.result_image) {
          break;
        }
        
        if (result.status === 3) {
          return { success: false, error: 'Generation failed by server' };
        }
      }
    }
    
    if (!result?.result_image) {
      return { 
        success: false, 
        error: `Timeout after ${attempts} attempts. Service is taking too long.` 
      };
    }
    
    // Step 5: Get result URL
    const resultUrl = result.result_image.startsWith('http') 
      ? result.result_image 
      : CONFIG.CDN_URL + result.result_image;
    console.log('Result URL:', resultUrl);
    
    // Step 6: Download and upload to cloud
    console.log('Step 5: Processing final image...');
    const resultBuffer = await utils.downloadImage(resultUrl);
    if (!resultBuffer) {
      return { success: false, error: 'Failed to download result image' };
    }
    
    const cloudUrl = await utils.uploadToCloud(resultBuffer);
    if (!cloudUrl) {
      return { success: false, error: 'Failed to upload to cloud storage' };
    }
    
    return {
      success: true,
      image_url: cloudUrl,
      original_url: resultUrl,
      task_id: taskId,
      attempts: attempts
    };
    
  } catch (error) {
    console.error(`Live3D Error: ${error.message}`);
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