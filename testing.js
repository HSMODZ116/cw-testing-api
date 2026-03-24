/**
 * AI CUSTOM TRANSFORMER - Fitur ke-117
 * Engine: GPT-Image-1 (Strict Custom Prompt)
 * Status: PRO (Prompt Mandatory)
 * Creator: Xena
 * Cloudflare Worker Version
 */

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
    
    // Get parameters from GET or POST
    let params = {};
    if (request.method === 'GET') {
      params = Object.fromEntries(url.searchParams);
    } else if (request.method === 'POST') {
      try {
        const contentType = request.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          params = await request.json();
        } else if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
          const formData = await request.formData();
          params = Object.fromEntries(formData);
        } else {
          params = Object.fromEntries(url.searchParams);
        }
      } catch (e) {
        params = Object.fromEntries(url.searchParams);
      }
    }

    const imageUrl = params.url;
    const prompt = params.prompt;

    // Strict validation
    if (!imageUrl) {
      return this.sendJsonResponse(400, {
        status: false,
        creator: 'Xena',
        error: "Masukkan parameter 'url' gambar!"
      });
    }

    if (!prompt) {
      return this.sendJsonResponse(400, {
        status: false,
        creator: 'Xena',
        error: "Prompt wajib diisi! Contoh: prompt=make it ghibli style"
      });
    }

    try {
      const resultBuffer = await this.convertAIImage(imageUrl, prompt);
      
      // Return image as response
      return new Response(resultBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': resultBuffer.length.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      });
      
    } catch (error) {
      return this.sendJsonResponse(500, {
        status: false,
        creator: 'Xena',
        error: error.message
      });
    }
  },

  /**
   * Convert AI Image
   * 
   * @param {string} imageUrl - URL of the image to convert
   * @param {string} prompt - Prompt for AI transformation
   * @returns {Promise<ArrayBuffer>} Binary image data
   */
  async convertAIImage(imageUrl, prompt) {
    // 1. Download image & convert to Base64
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36',
      },
    });

    if (!imageResponse.ok) {
      throw new Error('Gagal ambil gambar dari URL. HTTP ' + imageResponse.status);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const imgData = `data:${contentType};base64,${base64Image}`;

    // 2. Prepare JSON payload
    const payload = JSON.stringify({
      image: imgData,
      model: 'gpt-image-1',
      n: 1,
      prompt: prompt,
      quality: 'low',
      size: '1024x1024'
    });

    // 3. Send to Netlify Proxy
    const proxyResponse = await fetch('https://ghibli-proxy.netlify.app/.netlify/functions/ghibli-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://overchat.ai',
        'Referer': 'https://overchat.ai/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36',
      },
      body: payload,
    });

    if (!proxyResponse.ok) {
      throw new Error(`Proxy error: ${proxyResponse.status} ${proxyResponse.statusText}`);
    }

    const result = await proxyResponse.json();

    if (!result.success || !result.data || !result.data[0] || !result.data[0].b64_json) {
      const errorMsg = result.message || 'AI gagal memproses gambar dengan prompt tersebut.';
      throw new Error(errorMsg);
    }

    // Decode base64 to binary
    const binaryString = atob(result.data[0].b64_json);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  },

  /**
   * Send JSON response
   * 
   * @param {number} statusCode - HTTP status code
   * @param {object} data - Response data
   * @returns {Response} JSON response
   */
  sendJsonResponse(statusCode, data) {
    return new Response(JSON.stringify(data), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

// API Info for documentation
export const apiInfo = {
  name: "AIConvert",
  desc: "Transformasi gambar berdasarkan prompt (Cyberpunk, Anime, Pixar, dll).",
  category: "TEST",
  params: ["url", "prompt"]
};