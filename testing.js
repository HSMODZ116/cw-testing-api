// Cloudflare Worker for Flux AI Image Generation & Editing

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

    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const prompt = url.searchParams.get('prompt');
    const image = url.searchParams.get('image');
    const model = url.searchParams.get('model') || 'fal-ai/flux-2';

    // Validation
    if (!action) {
      return jsonResponse({
        status: false,
        error: 'Parameter "action" diperlukan. Pilih: "edit" atau "generate"'
      }, 400);
    }

    if (!prompt) {
      return jsonResponse({
        status: false,
        error: 'Parameter "prompt" diperlukan'
      }, 400);
    }

    if (!['edit', 'generate'].includes(action)) {
      return jsonResponse({
        status: false,
        error: 'Action tidak valid. Pilih: "edit" atau "generate"'
      }, 400);
    }

    if (action === 'edit' && !image) {
      return jsonResponse({
        status: false,
        error: 'Untuk action "edit", parameter "image" diperlukan (URL)'
      }, 400);
    }

    try {
      let result;
      if (action === 'edit') {
        result = await handleImageEdit(image, prompt, env);
      } else {
        result = await handleImageGenerate(prompt, model, env);
      }

      if (!result.success) {
        return jsonResponse({
          status: false,
          error: result.msg
        }, 500);
      }

      return jsonResponse({
        status: true,
        data: result
      });

    } catch (error) {
      return jsonResponse({
        status: false,
        statusCode: 500,
        creator: 'shannz',
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
    REFRESH: '/auth/v1/token',
    EDIT: '/functions/v1/edit-image',
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

// Session storage using Cloudflare KV (you need to bind a KV namespace named 'SESSION')
// If you don't want to use KV, you can use a simple in-memory store (but it won't persist across requests)
let SESSION_CACHE = {
  access_token: null,
  refresh_token: null,
  expires_at: 0
};

async function getSession(env) {
  // Try to get from KV if available
  if (env && env.SESSION) {
    const stored = await env.SESSION.get('flux_session', 'json');
    if (stored && stored.access_token && stored.expires_at > Date.now()) {
      return stored;
    }
  }
  
  // Fallback to in-memory cache
  if (SESSION_CACHE.access_token && SESSION_CACHE.expires_at > Date.now()) {
    return SESSION_CACHE;
  }
  
  return null;
}

async function setSession(session, env) {
  if (env && env.SESSION) {
    await env.SESSION.put('flux_session', JSON.stringify(session));
  }
  SESSION_CACHE = session;
}

async function handleAuth(env) {
  try {
    // Check existing session
    const existingSession = await getSession(env);
    if (existingSession && existingSession.access_token) {
      const isExpired = Date.now() >= existingSession.expires_at;
      if (!isExpired) {
        return existingSession.access_token;
      }
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

    const data = await response.json();

    if (data.access_token) {
      const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (60 * 60 * 1000) // 1 hour
      };
      await setSession(session, env);
      return session.access_token;
    }
    return null;
  } catch (error) {
    console.error('Auth Error:', error.message);
    return null;
  }
}

async function toBase64FromUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  } catch (e) {
    console.error('toBase64 Error:', e);
    return null;
  }
}

async function uploadToCloud(buffer, env) {
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
    console.error(`[Upload Cloud Error]: ${error.message}`);
    return null;
  }
}

async function handleImageEdit(imageInput, prompt, env) {
  try {
    const token = await handleAuth(env);
    if (!token) return { success: false, msg: 'Authentication failed' };

    const base64Image = await toBase64FromUrl(imageInput);
    if (!base64Image) return { success: false, msg: 'Invalid input image' };

    const payload = {
      image: base64Image,
      mimeType: 'image/png',
      prompt: prompt,
      model: 'auto',
      isFirstAttempt: true
    };

    const headers = { 
      ...CONFIG.HEADERS, 
      'apikey': CONFIG.SECRET_KEY, 
      'Authorization': `Bearer ${token}` 
    };

    const response = await fetch(CONFIG.BASE_ENDPOINT + CONFIG.PATHS.EDIT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data && data.image) {
      const resultBuffer = Uint8Array.from(atob(data.image), c => c.charCodeAt(0));
      const cloudUrl = await uploadToCloud(resultBuffer, env);
      
      if (!cloudUrl) return { success: false, msg: 'Failed to upload image to cloud' };

      return {
        success: true,
        prompt: data.prompt || prompt,
        model: data.model || 'auto',
        url: cloudUrl,
        type: 'edit'
      };
    }
    return { success: false, msg: 'No image data returned from API' };

  } catch (error) {
    console.error(`[Edit Image Error]: ${error.message}`);
    return { success: false, msg: error.message };
  }
}

async function handleImageGenerate(prompt, model, env) {
  try {
    const token = await handleAuth(env);
    if (!token) return { success: false, msg: 'Authentication failed' };

    const payload = { 
      prompt: prompt, 
      model: model 
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
      const resultBuffer = Uint8Array.from(atob(data.image), c => c.charCodeAt(0));
      const cloudUrl = await uploadToCloud(resultBuffer, env);

      if (!cloudUrl) return { success: false, msg: 'Failed to upload image to cloud' };

      return {
        success: true,
        prompt: data.prompt || prompt,
        model: data.model || model,
        url: cloudUrl,
        type: 'generate'
      };
    }
    return { success: false, msg: 'No image data returned from API' };

  } catch (error) {
    console.error(`[Generate Image Error]: ${error.message}`);
    return { success: false, msg: error.message };
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