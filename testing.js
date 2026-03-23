// Cloudflare Worker for Flux AI Image Generation
// Developer: Haseeb Sahil
// Channel: @hsmodzofc2
// Model: fal-ai/flux-pro (Fixed)

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

    // Validation - Check if prompt exists
    if (!prompt) {
      return jsonResponse({
        success: false,
        error: 'Prompt parameter is required. Please provide a prompt.',
        example: 'https://your-worker.workers.dev/?prompt=a beautiful sunset over mountains',
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

    try {
      const result = await generateImage(prompt, env);

      if (!result.success) {
        return jsonResponse({
          success: false,
          error: result.msg,
          developer: 'Haseeb Sahil',
          channel: '@hsmodzofc2'
        }, 500);
      }

      return jsonResponse({
        success: true,
        message: "Image generated successfully!",
        data: result,
        developer: 'Haseeb Sahil',
        channel: '@hsmodzofc2'
      });

    } catch (error) {
      // Log error for debugging (optional)
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
  BASE_ENDPOINT: 'https://dydkrpmnafsnivjxmipj.supabase.co',
  SECRET_KEY: 'sb_publishable_W_1Ofv9769iYEEn9dfyAHQ_OhuCER6g',
  PATHS: {
    SIGNUP: '/auth/v1/signup',
    GENERATE: '/functions/v1/generate-image'
  },
  HEADERS: {
    'User-Agent': 'Dart/3.9 (dart:io)',
    'Accept-Encoding': 'gzip',
    'x-supabase-client-platform': 'android',
    'x-client-info': 'supabase-flutter/2.10.3',
    'x-supabase-client-platform-version': '15 A15.0.2.0.VGWIDXM',
    'Content-Type': 'application/json; charset=utf-8',
    'x-supabase-api-version': '2024-01-01'
  }
};

// Fixed model - permanent
const FIXED_MODEL = 'fal-ai/flux-pro';

// Simple in-memory session storage
let SESSION = {
  access_token: null,
  expires_at: 0
};

async function getAuthToken(env) {
  try {
    // Check if existing token is still valid (not expired)
    if (SESSION.access_token && SESSION.expires_at > Date.now()) {
      return SESSION.access_token;
    }

    const payload = { 
      data: {}, 
      gotrue_meta_security: { captcha_token: null } 
    };
    
    const headers = { 
      ...CONFIG.HEADERS, 
      'apikey': CONFIG.SECRET_KEY, 
      'Authorization': `Bearer ${CONFIG.SECRET_KEY}` 
    };
    
    const response = await fetch(CONFIG.BASE_ENDPOINT + CONFIG.PATHS.SIGNUP, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Auth failed with status: ${response.status}`);
    }

    const data = await response.json();

    if (data.access_token) {
      SESSION = {
        access_token: data.access_token,
        expires_at: Date.now() + (60 * 60 * 1000) // 1 hour
      };
      return SESSION.access_token;
    }
    
    throw new Error('No access token received from auth service');
  } catch (error) {
    console.error('Auth Error:', error.message);
    return null;
  }
}

async function uploadToCloud(buffer) {
  try {
    const filename = `flux-${crypto.randomUUID()}.png`;
    const contentType = 'image/png';
    const fileSize = buffer.byteLength;

    // Get upload URL
    const uploadUrlResponse = await fetch('https://api.cloudsky.biz.id/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileKey: filename,
        contentType: contentType,
        fileSize: fileSize
      })
    });

    if (!uploadUrlResponse.ok) {
      throw new Error(`Failed to get upload URL: ${uploadUrlResponse.status}`);
    }

    const { uploadUrl } = await uploadUrlResponse.json();

    if (!uploadUrl) {
      throw new Error('No upload URL received');
    }

    // Upload to cloud storage
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileSize.toString(),
        'x-amz-server-side-encryption': 'AES256'
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status: ${uploadResponse.status}`);
    }

    return `https://api.cloudsky.biz.id/file?key=${encodeURIComponent(filename)}`;
  } catch (error) {
    console.error(`Upload Error: ${error.message}`);
    return null;
  }
}

async function generateImage(prompt, env) {
  try {
    // Get authentication token
    const token = await getAuthToken(env);
    if (!token) {
      return { 
        success: false, 
        msg: 'Authentication failed. Please try again later.' 
      };
    }

    // Prepare request payload with fixed model
    const payload = { 
      prompt: prompt, 
      model: FIXED_MODEL 
    };
    
    const headers = { 
      ...CONFIG.HEADERS, 
      'apikey': CONFIG.SECRET_KEY, 
      'Authorization': `Bearer ${token}` 
    };
    
    // Call the generation API
    const response = await fetch(CONFIG.BASE_ENDPOINT + CONFIG.PATHS.GENERATE, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Generation API failed with status: ${response.status}`);
    }

    const data = await response.json();

    // Validate response
    if (!data || !data.image) {
      return { 
        success: false, 
        msg: 'No image data received from generation service.' 
      };
    }

    // Convert base64 to buffer
    try {
      const binaryString = atob(data.image);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Upload to cloud storage
      const cloudUrl = await uploadToCloud(bytes);

      if (!cloudUrl) {
        return { 
          success: false, 
          msg: 'Failed to upload generated image to cloud storage.' 
        };
      }

      // Return successful response
      return {
        success: true,
        prompt: prompt,
        model: FIXED_MODEL,
        url: cloudUrl,
        generated_at: new Date().toISOString()
      };
    } catch (decodeError) {
      console.error('Base64 decode error:', decodeError);
      return { 
        success: false, 
        msg: 'Failed to process image data.' 
      };
    }

  } catch (error) {
    console.error(`Generate Error: ${error.message}`);
    return { 
      success: false, 
      msg: `Generation failed: ${error.message}` 
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