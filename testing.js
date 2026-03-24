// Cloudflare Worker for Nanana AI - Image to Image Transformation
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
        example: 'https://your-worker.workers.dev/?image=https://example.com/image.jpg&prompt=make it anime style',
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      }, 400);
    }

    if (!prompt) {
      return jsonResponse({
        success: false,
        error: 'Prompt parameter is required. Describe what you want.',
        example: 'anime style, cartoon, realistic, etc.',
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
      const result = await nananaTransform(image, prompt);

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
          prompt: prompt,
          job_id: result.job_id,
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
  AKUNLAMA_URL: 'https://akunlama.com',
  USER_AGENT: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
};

const utils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  genXfpid: () => {
    const p1 = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const p2 = crypto.randomUUID().replace(/-/g, '');
    return btoa(`${p1}.${p2}`);
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

// Nanana Auth Functions
const nananaAuth = {
  getOTP: async (username) => {
    const url = `${CONFIG.AKUNLAMA_URL}/api/v1/mail/list?recipient=${username}`;
    
    for (let i = 0; i < 20; i++) {
      const result = await utils.makeRequest(url, {
        method: 'GET',
        headers: { 'User-Agent': CONFIG.USER_AGENT }
      });
      
      if (result.success && result.data && result.data.length > 0) {
        const { region, key } = result.data[0].storage;
        const htmlResult = await utils.makeRequest(
          `${CONFIG.AKUNLAMA_URL}/api/v1/mail/getHtml?region=${region}&key=${key}`,
          { method: 'GET', headers: { 'User-Agent': CONFIG.USER_AGENT } }
        );
        
        if (htmlResult.success && htmlResult.data) {
          const html = htmlResult.data;
          const otpMatch = html.match(/\b\d{6}\b/);
          if (otpMatch) return otpMatch[0];
        }
      }
      
      await utils.delay(3000);
    }
    throw new Error('OTP Timeout!');
  },

  getHeaders: async () => {
    try {
      const username = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const email = `${username}@akunlama.com`;
      
      // Send OTP
      const sendResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/auth/email-otp/send-verification-otp`, {
        method: 'POST',
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Content-Type': 'application/json',
          'Origin': 'https://nanana.app',
          'Referer': 'https://nanana.app/en'
        },
        body: JSON.stringify({ email, type: 'sign-in' })
      });
      
      if (!sendResult.success) {
        throw new Error('Failed to send OTP');
      }
      
      // Get OTP from email
      const otp = await nananaAuth.getOTP(username);
      
      // Login with OTP
      const loginResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/auth/sign-in/email-otp`, {
        method: 'POST',
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Content-Type': 'application/json',
          'Origin': 'https://nanana.app',
          'Referer': 'https://nanana.app/en'
        },
        body: JSON.stringify({ email, otp })
      });
      
      if (!loginResult.success) {
        throw new Error('Login failed');
      }
      
      // Extract cookies from response headers (simulated)
      // In Cloudflare Workers, we need to handle cookies differently
      const cookie = `session=${loginResult.data?.session?.token || ''}`;
      
      return {
        'User-Agent': CONFIG.USER_AGENT,
        'Content-Type': 'application/json',
        'Origin': 'https://nanana.app',
        'Referer': 'https://nanana.app/en',
        'Cookie': cookie,
        'x-fp-id': utils.genXfpid()
      };
      
    } catch (error) {
      console.error('Auth Error:', error);
      // Return fallback headers
      return {
        'User-Agent': CONFIG.USER_AGENT,
        'Origin': 'https://nanana.app',
        'Referer': 'https://nanana.app/en',
        'x-fp-id': utils.genXfpid()
      };
    }
  }
};

async function nananaTransform(imageUrl, prompt) {
  try {
    // Step 1: Authentication
    console.log('Step 1: Authenticating...');
    const auth = await nananaAuth.getHeaders();
    
    // Step 2: Download image
    console.log('Step 2: Downloading image...');
    const imageBuffer = await utils.downloadImage(imageUrl);
    if (!imageBuffer) {
      return { success: false, error: 'Failed to download image' };
    }
    
    // Step 3: Upload image to Nanana
    console.log('Step 3: Uploading image...');
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'input.jpg');
    
    const uploadResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/upload-img`, {
      method: 'POST',
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Origin': 'https://nanana.app',
        'Referer': 'https://nanana.app/en',
        'Cookie': auth.Cookie || '',
        'x-fp-id': auth['x-fp-id']
      },
      body: formData
    });
    
    if (!uploadResult.success || !uploadResult.data?.url) {
      console.log('Upload failed:', uploadResult);
      return { 
        success: false, 
        error: 'Failed to upload image',
        details: uploadResult.raw 
      };
    }
    
    const uploadedUrl = uploadResult.data.url;
    console.log('Upload successful:', uploadedUrl);
    
    // Step 4: Create job
    console.log('Step 4: Creating transformation job...');
    const jobResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/image-to-image`, {
      method: 'POST',
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Content-Type': 'application/json',
        'Origin': 'https://nanana.app',
        'Referer': 'https://nanana.app/en',
        'Cookie': auth.Cookie || '',
        'x-fp-id': auth['x-fp-id']
      },
      body: JSON.stringify({ 
        prompt: prompt, 
        image_urls: [uploadedUrl] 
      })
    });
    
    if (!jobResult.success || !jobResult.data?.request_id) {
      console.log('Job creation failed:', jobResult);
      return { 
        success: false, 
        error: 'Failed to create job',
        details: jobResult.raw 
      };
    }
    
    const requestId = jobResult.data.request_id;
    console.log('Job created, ID:', requestId);
    
    // Step 5: Poll for result
    console.log('Step 5: Waiting for result...');
    let result = null;
    const maxAttempts = 15;
    
    for (let i = 0; i < maxAttempts; i++) {
      await utils.delay(5000);
      
      const checkResult = await utils.makeRequest(`${CONFIG.BASE_URL}/api/get-result`, {
        method: 'POST',
        headers: {
          'User-Agent': CONFIG.USER_AGENT,
          'Content-Type': 'application/json',
          'Origin': 'https://nanana.app',
          'Referer': 'https://nanana.app/en',
          'Cookie': auth.Cookie || '',
          'x-fp-id': auth['x-fp-id']
        },
        body: JSON.stringify({ 
          requestId: requestId, 
          type: 'image-to-image' 
        })
      });
      
      console.log(`Attempt ${i + 1}/${maxAttempts}:`, checkResult.data?.completed ? 'Completed' : 'Processing');
      
      if (checkResult.success && checkResult.data?.completed) {
        const images = checkResult.data?.data?.images;
        if (images && images.length > 0) {
          result = images[0].url;
          break;
        }
      }
    }
    
    if (!result) {
      return { success: false, error: 'Processing timeout after 75 seconds' };
    }
    
    // Step 6: Download result and upload to cloud
    console.log('Step 6: Processing final image...');
    const resultBuffer = await utils.downloadImage(result);
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
      original_url: result,
      job_id: requestId
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