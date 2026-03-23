// Cloudflare Worker for Flux AI Image Generation
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
        status: false,
        error: 'Sirf GET method allow hai'
      }, 405);
    }

    const url = new URL(request.url);
    const prompt = url.searchParams.get('prompt');

    // Validation
    if (!prompt) {
      return jsonResponse({
        status: false,
        error: 'Meharbani karke "prompt" parameter do'
      }, 400);
    }

    try {
      const result = await generateImage(prompt, env);

      if (!result.success) {
        return jsonResponse({
          status: false,
          error: result.msg
        }, 500);
      }

      return jsonResponse({
        status: true,
        message: "Tasveer kamyabi se bana li gayi!",
        data: result
      });

    } catch (error) {
      return jsonResponse({
        status: false,
        error: error.message
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
  // Check if existing token is still valid (not expired)
  if (SESSION.access_token && SESSION.expires_at > Date.now()) {
    return SESSION.access_token;
  }

  try {
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

    const data = await response.json();

    if (data.access_token) {
      SESSION = {
        access_token: data.access_token,
        expires_at: Date.now() + (60 * 60 * 1000) // 1 hour
      };
      return SESSION.access_token;
    }
    return null;
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

    const { uploadUrl } = await uploadUrlResponse.json();

    // Upload to cloud storage
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

async function generateImage(prompt, env) {
  try {
    const token = await getAuthToken(env);
    if (!token) {
      return { 
        success: false, 
        msg: 'Auth mein masla hogaya' 
      };
    }

    // Using fixed model
    const payload = { 
      prompt: prompt, 
      model: FIXED_MODEL 
    };
    
    const headers = { 
      ...CONFIG.HEADERS, 
      'apikey': CONFIG.SECRET_KEY, 
      'Authorization': `Bearer ${token}` 
    };
    
    const response = await fetch(CONFIG.BASE_ENDPOINT + CONFIG.PATHS.GENERATE, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data && data.image) {
      // Convert base64 to buffer
      const binaryString = atob(data.image);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const cloudUrl = await uploadToCloud(bytes);

      if (!cloudUrl) {
        return { 
          success: false, 
          msg: 'Tasveer upload nahi hui' 
        };
      }

      return {
        success: true,
        prompt: prompt,
        model: FIXED_MODEL,
        url: cloudUrl
      };
    }
    
    return { 
      success: false, 
      msg: 'Tasveer ka data nahi mila' 
    };

  } catch (error) {
    console.error(`Generate Error: ${error.message}`);
    return { 
      success: false, 
      msg: `Kuch masla hogaya: ${error.message}` 
    };
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}