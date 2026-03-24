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
        error: 'An unexpected error occurred. Please try again later.',
        details: error.message,
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 500);
    }
  }
};

const CONFIG = {
  BASE_URL: 'https://app.live3d.io',
  CDN_URL: 'https://temp.live3d.io/',
  PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwlO+boC6cwRo3UfXVBadaYwcX
0zKS2fuVNY2qZ0dgwb1NJ+/Q9FeAosL4ONiosD71on3PVYqRUlL5045mvH2K9i8b
AFVMEip7E6RMK6tKAAif7xzZrXnP1GZ5Rijtqdgwh+YmzTo39cuBCsZqK9oEoeQ3
r/myG9S+9cR5huTuFQIDAQAB
-----END PUBLIC KEY-----`,
  APP_ID: 'aifaceswap',
  U_ID: '1H5tRtzsBkqXcaJ',
  TH_VER: '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
  UA: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
  ORIGIN_FROM: '8f3f0c7387123ae0'
};

// Utility functions
const utils = {
  randStr: (len) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < len; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  },

  async aesEncrypt(data, keyStr) {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(keyStr.slice(0, 16)),
        { name: 'AES-CBC' },
        false,
        ['encrypt']
      );
      
      const iv = new TextEncoder().encode(keyStr.slice(0, 16));
      const encoded = new TextEncoder().encode(data);
      
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: iv },
        key,
        encoded
      );
      
      return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    } catch (error) {
      // Fallback: simple base64 encoding
      return btoa(data);
    }
  },

  async rsaEncrypt(data) {
    try {
      const pem = CONFIG.PUBLIC_KEY;
      const pemContents = pem
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s/g, '');
      
      const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
      
      const publicKey = await crypto.subtle.importKey(
        'spki',
        binaryKey,
        { name: 'RSA-OAEP', hash: 'SHA-1' },
        false,
        ['encrypt']
      );
      
      const encoded = new TextEncoder().encode(data);
      const encrypted = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP', hash: 'SHA-1' },
        publicKey,
        encoded
      );
      
      return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    } catch (error) {
      return btoa(data);
    }
  },

  async generateHeaders(type, fp = null) {
    const now = Math.floor(Date.now() / 1000);
    const uuid = crypto.randomUUID();
    const aesKey = utils.randStr(16);
    const fingerprint = fp || crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const xGuide = await utils.rsaEncrypt(aesKey);

    const signStr = type === 'upload'
      ? `${CONFIG.APP_ID}:${uuid}:${xGuide}`
      : `${CONFIG.APP_ID}:${CONFIG.U_ID}:${now}:${uuid}:${xGuide}`;

    const fp1 = await utils.aesEncrypt(`${CONFIG.APP_ID}:${fingerprint}`, aesKey);
    const xSign = await utils.aesEncrypt(signStr, aesKey);

    return {
      fp: fingerprint,
      fp1: fp1,
      'x-guide': xGuide,
      'x-sign': xSign,
      'x-code': Date.now().toString()
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
  }
};

const BASE_HEADERS = {
  'User-Agent': CONFIG.UA,
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://live3d.io',
  'Referer': 'https://live3d.io/',
  'theme-version': CONFIG.TH_VER,
};

async function uploadImage(imageBuffer) {
  const ch = await utils.generateHeaders('upload');
  
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  formData.append('file', blob, `upload_${Date.now()}.jpg`);
  formData.append('fn_name', 'demo-image-editor');
  formData.append('request_from', '9');
  formData.append('origin_from', CONFIG.ORIGIN_FROM);

  const response = await fetch(`${CONFIG.BASE_URL}/aitools/upload-img`, {
    method: 'POST',
    headers: { ...BASE_HEADERS, ...ch },
    body: formData
  });

  const data = await response.json();
  
  if (!data?.data?.path) {
    throw new Error('Upload failed: ' + JSON.stringify(data));
  }
  
  return { path: data.data.path, fp: ch.fp };
}

async function createJob(remotePath, prompt, fp) {
  const ch = await utils.generateHeaders('create', fp);
  
  const payload = {
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

  const response = await fetch(`${CONFIG.BASE_URL}/aitools/of/create`, {
    method: 'POST',
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json', ...ch },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  
  if (!data?.data?.task_id) {
    throw new Error('Job creation failed: ' + JSON.stringify(data));
  }
  
  return data.data.task_id;
}

async function checkJob(taskId, fp) {
  const ch = await utils.generateHeaders('check', fp);
  
  const payload = {
    task_id: taskId,
    fn_name: 'demo-image-editor',
    call_type: 3,
    request_from: 9,
    origin_from: CONFIG.ORIGIN_FROM,
  };

  const response = await fetch(`${CONFIG.BASE_URL}/aitools/of/check-status`, {
    method: 'POST',
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json', ...ch },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return data?.data;
}

async function live3dEdit(imageUrl, prompt) {
  try {
    // Step 1: Download image
    console.log('Step 1: Downloading image...');
    const imageBuffer = await utils.downloadImage(imageUrl);
    if (!imageBuffer) {
      return { success: false, error: 'Failed to download image' };
    }

    // Step 2: Upload to Live3D
    console.log('Step 2: Uploading to Live3D...');
    const upload = await uploadImage(imageBuffer);
    
    // Step 3: Create job
    console.log('Step 3: Creating edit job...');
    const taskId = await createJob(upload.path, prompt, upload.fp);
    
    // Step 4: Poll for result
    console.log('Step 4: Waiting for result...');
    let result;
    let attempts = 0;
    const maxAttempts = 30;
    
    do {
      await new Promise(r => setTimeout(r, 4000));
      result = await checkJob(taskId, upload.fp);
      attempts++;
      console.log(`Attempt ${attempts}/${maxAttempts}: Status = ${result?.status}`);
      
      if (attempts >= maxAttempts) {
        throw new Error('Timeout - Server taking too long to respond');
      }
    } while (result?.status !== 2);
    
    if (!result?.result_image) {
      throw new Error('No result received from server');
    }
    
    // Step 5: Get result URL
    const resultUrl = CONFIG.CDN_URL + result.result_image;
    console.log('Step 5: Downloading result...');
    
    // Step 6: Download and upload to cloud
    const resultBuffer = await utils.downloadImage(resultUrl);
    if (!resultBuffer) {
      return { success: false, error: 'Failed to download result' };
    }
    
    const cloudUrl = await utils.uploadToCloud(resultBuffer);
    if (!cloudUrl) {
      return { success: false, error: 'Failed to upload to cloud' };
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