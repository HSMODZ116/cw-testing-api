// Cloudflare Worker for Live3D AI - Cloth Remover Generator
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
    const prompt = url.searchParams.get('prompt') || "best quality, naked, nude";
    const cloth_type = url.searchParams.get('cloth_type') || "full_outfits";

    // Validation
    if (!image) {
      return jsonResponse({
        success: false,
        error: 'Image parameter is required. Please provide an image URL.',
        example: 'https://your-worker.workers.dev/?image=https://example.com/image.jpg',
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

    // Validate cloth_type
    const validClothTypes = [
      "full_outfits", 
      "upper_body", 
      "lower_body", 
      "dresses", 
      "skirts"
    ];
    
    if (!validClothTypes.includes(cloth_type)) {
      return jsonResponse({
        success: false,
        error: `Invalid cloth_type. Choose from: ${validClothTypes.join(', ')}`,
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    try {
      const result = await handleLive3DGenerate(image, {
        prompt: prompt,
        cloth_type: cloth_type,
        request_from: 9
      });

      if (!result.success) {
        return jsonResponse({
          success: false,
          error: result.msg,
          details: result.errorData,
          developer: 'Haseeb Sahil',
          channel: '@hsmodzofc2'
        }, 500);
      }

      return jsonResponse({
        success: true,
        message: "Image generated successfully!",
        data: {
          url: result.resultUrl,
          originalUrl: result.originalUrl,
          taskId: result.taskId,
          attempts: result.attempts,
          prompt: result.prompt,
          cloth_type: result.cloth_type,
          timestamp: result.timestamp
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
  ENDPOINTS: {
    UPLOAD: '/aitools/upload-img',
    CREATE: '/aitools/of/create',
    STATUS: '/aitools/of/check-status'
  },
  SECRETS: {
    FP: '78dc286eaeb7fb88586e07f0d18bf61b',
    APP_ID: 'aifaceswap',
    PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwlO+boC6cwRo3UfXVBadaYwcX
0zKS2fuVNY2qZ0dgwb1NJ+/Q9FeAosL4ONiosD71on3PVYqRUlL5045mvH2K9i8b
AFVMEip7E6RMK6tKAAif7xzZrXnP1GZ5Rijtqdgwh+YmzTo39cuBCsZqK9oEoeQ3
r/myG9S+9cR5huTuFQIDAQAB
-----END PUBLIC KEY-----`
  },
  HEADERS: {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'sec-ch-ua-platform': '"Android"',
    'theme-version': '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
    'origin': 'https://live3d.io',
    'referer': 'https://live3d.io/',
    'priority': 'u=1, i'
  }
};

const utils = {
  genHex: (bytes) => {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  },
  
  genRandomString: (length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Simplified AES encryption using Web Crypto API
  async aesEncrypt(plaintext, keyStr, ivStr) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(keyStr),
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );
    
    const iv = new TextEncoder().encode(ivStr);
    const encoded = new TextEncoder().encode(plaintext);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: iv },
      key,
      encoded
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  },

  // Simplified RSA encryption
  async rsaEncrypt(data) {
    const publicKeyPem = CONFIG.SECRETS.PUBLIC_KEY;
    const publicKey = await importPublicKey(publicKeyPem);
    
    const encoded = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      encoded
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  },

  async generateHeaders() {
    const aesKey = utils.genRandomString(16);
    const xCode = Date.now().toString();
    const xGuide = await utils.rsaEncrypt(aesKey);
    const plaintextFp = `${CONFIG.SECRETS.APP_ID}:${CONFIG.SECRETS.FP}`;
    const fp1 = await utils.aesEncrypt(plaintextFp, aesKey, aesKey);

    return {
      ...CONFIG.HEADERS,
      'x-code': xCode,
      'x-guide': xGuide,
      'fp': CONFIG.SECRETS.FP,
      'fp1': fp1
    };
  },

  async downloadImage(url) {
    try {
      const response = await fetch(url);
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
  },

  bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...buffer));
  }
};

// Helper function to import RSA public key
async function importPublicKey(pem) {
  const pemContents = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    'spki',
    binaryKey,
    { name: 'RSA-OAEP', hash: 'SHA-1' },
    false,
    ['encrypt']
  );
}

async function handleLive3DGenerate(imageInput, options = {}) {
  const {
    prompt = "best quality, naked, nude",
    cloth_type = "full_outfits",
    request_from = 9
  } = options;

  const originFrom = utils.genHex(8);
  
  console.log(`Live3D Process [Hex: ${originFrom}]`);

  try {
    let imageBuffer;
    
    // Handle input type
    if (imageInput instanceof Uint8Array) {
      imageBuffer = imageInput;
    } else if (imageInput.startsWith('http')) {
      imageBuffer = await utils.downloadImage(imageInput);
      if (!imageBuffer) return { 
        success: false, 
        msg: 'Failed to download image from URL' 
      };
    } else {
      return { 
        success: false, 
        msg: 'Invalid input. Please provide image URL or buffer.' 
      };
    }

    // Step 1: Upload image
    console.log(`[1/4] Preparing upload...`);
    
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, `upload_${Date.now()}.jpg`);
    formData.append('fn_name', 'cloth-change');
    formData.append('request_from', request_from.toString());
    formData.append('origin_from', originFrom);

    const headers = await utils.generateHeaders();
    
    console.log(`[2/4] Uploading image...`);
    const uploadRes = await fetch(CONFIG.BASE_URL + CONFIG.ENDPOINTS.UPLOAD, {
      method: 'POST',
      headers: headers,
      body: formData
    });
    
    const uploadData = await uploadRes.json();
    let serverPath = uploadData.data;
    if (typeof serverPath === 'object' && serverPath.path) {
      serverPath = serverPath.path;
    }

    if (!serverPath) {
      console.log('Upload response:', uploadData);
      return { success: false, msg: 'Failed to get server path after upload' };
    }

    console.log(`[3/4] Starting generation...`);
    
    // Step 2: Submit generation task
    const submitPayload = {
      "fn_name": "cloth-change",
      "call_type": 3,
      "input": {
        "source_image": serverPath,
        "prompt": prompt,
        "cloth_type": cloth_type,
        "request_from": request_from,
        "type": 1
      },
      "request_from": request_from,
      "origin_from": originFrom
    };

    const submitRes = await fetch(CONFIG.BASE_URL + CONFIG.ENDPOINTS.CREATE, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(submitPayload)
    });

    const submitData = await submitRes.json();
    const taskId = submitData.data?.task_id;
    
    if (!taskId) {
      return { success: false, msg: 'Failed to get Task ID' };
    }

    console.log(`Task ID: ${taskId}`);

    // Step 3: Check status and wait for result
    let isCompleted = false;
    let attempts = 0;
    let resultUrl = null;
    const maxAttempts = 60;
    let lastStatus = '';

    while (!isCompleted && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 3000));

      const statusPayload = {
        "task_id": taskId,
        "fn_name": "cloth-change",
        "call_type": 3,
        "consume_type": 0,
        "request_from": request_from,
        "origin_from": originFrom
      };

      try {
        const statusRes = await fetch(CONFIG.BASE_URL + CONFIG.ENDPOINTS.STATUS, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(statusPayload)
        });

        const statusData = await statusRes.json();
        const data = statusData.data;
        
        if (!data) continue;

        const status = data.status;
        
        if (status === 2) {
          resultUrl = data.result_image;
          if (resultUrl && !resultUrl.startsWith('http')) {
            resultUrl = CONFIG.CDN_URL + resultUrl;
          }
          isCompleted = true;
          lastStatus = 'Success';
          console.log(`✓ Generation completed!`);
        } else if (status === 1) {
          lastStatus = `Generating...`;
        } else {
          lastStatus = `Queue (Rank ${data.rank || 'unknown'})`;
        }
        
        console.log(`[4/4] Status: ${lastStatus} (${attempts}/${maxAttempts})`);
      } catch (statusError) {
        console.log(`\nStatus check error: ${statusError.message}`);
      }
    }

    console.log('');

    if (!resultUrl) {
      return { 
        success: false, 
        msg: `Generation timeout after ${attempts} attempts` 
      };
    }

    // Step 4: Download and upload to cloud
    console.log(`Downloading result...`);
    const resultBuffer = await utils.downloadImage(resultUrl);
    if (!resultBuffer) {
      return { 
        success: false, 
        msg: 'Failed to download result image' 
      };
    }

    console.log(`Uploading to cloud...`);
    const cloudUrl = await utils.uploadToCloud(resultBuffer);
    if (!cloudUrl) {
      return { 
        success: false, 
        msg: 'Failed to upload result to cloud' 
      };
    }

    return {
      success: true,
      resultUrl: cloudUrl,
      originalUrl: resultUrl,
      taskId: taskId,
      attempts: attempts,
      prompt: prompt,
      cloth_type: cloth_type,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`\n[Live3D Error]: ${error.message}`);
    return { 
      success: false, 
      msg: error.message
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