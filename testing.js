// Cloudflare Worker for PixWithAI - Image to Image Transformation
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
    const prompt = url.searchParams.get('prompt') || "transform this image";

    // Validation
    if (!image) {
      return jsonResponse({
        success: false,
        error: 'Image parameter is required. Please provide an image URL.',
        example: 'https://your-worker.workers.dev/?image=https://example.com/image.jpg&prompt=make it cartoon style',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    // Validate image URL
    if (!image.startsWith('http')) {
      return jsonResponse({
        success: false,
        error: 'Only HTTP/HTTPS image URLs are supported.',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    try {
      const result = await img2imgTransform(image, prompt);

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
          original_image: image,
          transformed_image: result.image_url,
          prompt: result.prompt,
          model: result.model,
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
  BASE_URL: 'https://api.pixwith.ai',
  TOKEN: '2d27429c20f2ac52625f95182b8f0f861',
  USER_AGENT: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
};

const utils = {
  genMD5: () => {
    let s = "";
    const chars = "0123456789abcdef";
    for (let i = 0; i < 32; i++) {
      s += chars[Math.floor(Math.random() * 16)];
    }
    return s;
  },

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
      const filename = `piximg-${crypto.randomUUID()}.png`;
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
      
      console.log(`Request to ${url}: Status ${response.status}`);
      console.log(`Response preview: ${text.substring(0, 200)}`);
      
      try {
        const data = JSON.parse(text);
        return { success: response.ok, data: data, status: response.status };
      } catch (e) {
        return { 
          success: false, 
          error: 'Invalid JSON response', 
          raw: text.substring(0, 500),
          status: response.status 
        };
      }
    } catch (error) {
      console.error(`Request Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
};

async function img2imgTransform(imageUrl, prompt) {
  const headers = {
    'User-Agent': CONFIG.USER_AGENT,
    'Content-Type': 'application/json',
    'Origin': 'https://pixwith.ai',
    'Referer': 'https://pixwith.ai/',
    'Accept-Language': 'id-ID,id;q=0.9',
    'x-session-token': CONFIG.TOKEN
  };

  try {
    // Step 1: Download image
    console.log('Step 1: Downloading image...');
    const imageBuffer = await utils.downloadImage(imageUrl);
    if (!imageBuffer) {
      return { success: false, error: 'Failed to download image from URL' };
    }
    console.log(`Image downloaded: ${imageBuffer.length} bytes`);

    // Step 2: Get S3 presigned URL
    console.log('Step 2: Getting upload URL...');
    const filename = utils.genMD5() + '.jpg';
    
    const preResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/chats/pre_url`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ 
        image_name: filename, 
        content_type: 'image/jpeg' 
      })
    });

    if (!preResult.success) {
      console.log('Pre URL failed:', preResult);
      return { 
        success: false, 
        error: 'Failed to get upload URL from PixWithAI',
        details: preResult.raw || preResult.error
      };
    }

    if (!preResult.data?.data?.url) {
      console.log('Invalid pre URL response:', preResult.data);
      return { 
        success: false, 
        error: 'Invalid response from PixWithAI',
        details: JSON.stringify(preResult.data).substring(0, 200)
      };
    }

    const uploadData = preResult.data.data.url;
    console.log('Upload data received:', Object.keys(uploadData));
    
    if (!uploadData.fields || !uploadData.url) {
      return { 
        success: false, 
        error: 'Missing upload fields or URL',
        details: JSON.stringify(uploadData).substring(0, 200)
      };
    }

    // Step 3: Upload to S3 via multipart form
    console.log('Step 3: Uploading to S3...');
    const formData = new FormData();
    Object.entries(uploadData.fields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, filename);

    const s3Response = await fetch(uploadData.url, {
      method: 'POST',
      body: formData
    });

    if (s3Response.status !== 204) {
      const s3Text = await s3Response.text();
      console.log('S3 Upload failed:', s3Text);
      return { 
        success: false, 
        error: `S3 upload failed: ${s3Response.status}`,
        details: s3Text.substring(0, 200)
      };
    }

    const imageKey = uploadData.fields.key;
    console.log('Upload successful, key:', imageKey);

    // Step 4: Get last UID before create
    console.log('Step 4: Getting last UID...');
    const beforeResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/items/history`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ 
        tool_type: '1', 
        tag: '', 
        page: 0, 
        page_size: 1 
      })
    });

    let lastUid = null;
    if (beforeResult.success && beforeResult.data?.data?.items?.length > 0) {
      lastUid = beforeResult.data.data.items[0].uid;
      console.log('Last UID:', lastUid);
    }

    // Step 5: Create task
    console.log('Step 5: Creating transformation task...');
    const createPayload = {
      images: { image1: imageKey },
      prompt: prompt,
      options: { 
        prompt_optimization: true, 
        num_outputs: 1, 
        aspect_ratio: '0' 
      },
      model_id: '1-0'
    };

    const createResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/items/create`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(createPayload)
    });

    if (!createResult.success) {
      console.log('Create task failed:', createResult);
      return { 
        success: false, 
        error: 'Failed to create transformation task',
        details: createResult.raw || createResult.error
      };
    }

    if (createResult.data?.code !== 1) {
      return { 
        success: false, 
        error: createResult.data?.message || 'Create task failed',
        details: createResult.data
      };
    }

    // Step 6: Poll for result
    console.log('Step 6: Waiting for result...');
    let result = null;
    const maxAttempts = 30;
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const historyResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/items/history`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ 
          tool_type: '1', 
          tag: '', 
          page: 0, 
          page_size: 1 
        })
      });

      if (historyResult.success && historyResult.data?.data?.items?.length > 0) {
        const item = historyResult.data.data.items[0];
        
        console.log(`Attempt ${i + 1}/${maxAttempts}: UID=${item.uid}, Status=${item.status}`);
        
        // Check if this is a new item (not the one we had before)
        if (item.uid !== lastUid && item.status === 2) {
          const output = item.result_urls?.find(u => !u.is_input);
          if (output) {
            result = { item, url: output.hd || output.url };
            console.log(`Result found on attempt ${i + 1}`);
            break;
          }
        }
        
        // Status 3 = Failed
        if (item.status === 3) {
          return { 
            success: false, 
            error: 'Transformation failed by server',
            details: item
          };
        }
      }
    }

    if (!result) {
      return { success: false, error: `Timeout after ${maxAttempts} attempts` };
    }

    // Step 7: Download result and upload to cloud
    console.log('Step 7: Processing final image...');
    const resultBuffer = await utils.downloadImage(result.url);
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
      original_url: result.url,
      prompt: result.item.prompt,
      model: result.item.model_name || 'Flux'
    };

  } catch (error) {
    console.error(`Img2Img Error: ${error.message}`);
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