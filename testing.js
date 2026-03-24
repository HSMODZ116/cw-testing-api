// Cloudflare Worker for Live3D AI Image Editing API
// Supports both GET and POST methods

// Configuration
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwlO+boC6cwRo3UfXVBadaYwcX
0zKS2fuVNY2qZ0dgwb1NJ+/Q9FeAosL4ONiosD71on3PVYqRUlL5045mvH2K9i8b
AFVMEip7E6RMK6tKAAif7xzZrXnP1GZ5Rijtqdgwh+YmzTo39cuBCsZqK9oEoeQ3
r/myG9S+9cR5huTuFQIDAQAB
-----END PUBLIC KEY-----`;

const APP_ID = 'aifaceswap';
const U_ID = '1H5tRtzsBkqXcaJ';
const TH_VER = '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36';
const BASE_URL = 'https://app.live3d.io';

// Helper: Random string generator
function randStr(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < len; i++) {
        s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
}

// Helper: AES-CBC encryption (using Web Crypto API)
async function aesenc(data, keyStr) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(keyStr),
        { name: 'AES-CBC' },
        false,
        ['encrypt']
    );
    
    const iv = new TextEncoder().encode(keyStr);
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: iv },
        key,
        new TextEncoder().encode(data)
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// Helper: RSA encryption (using Web Crypto API)
async function rsaenc(data) {
    const pemToBuffer = (pem) => {
        const pemContent = pem.replace(/-----BEGIN PUBLIC KEY-----/, '')
            .replace(/-----END PUBLIC KEY-----/, '')
            .replace(/\s/g, '');
        return Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
    };
    
    const publicKeyBuffer = pemToBuffer(PUBLIC_KEY);
    
    const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-1' },
        false,
        ['encrypt']
    );
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        new TextEncoder().encode(data)
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// Generate request headers
async function genHeaders(type, fp = null) {
    const now = Math.floor(Date.now() / 1000);
    const uuid = crypto.randomUUID();
    const aesKey = randStr(16);
    const fingerprint = fp || [...Array(16)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const xGuide = await rsaenc(aesKey);
    
    const signStr = type === 'upload'
        ? `${APP_ID}:${uuid}:${xGuide}`
        : `${APP_ID}:${U_ID}:${now}:${uuid}:${xGuide}`;
    
    return {
        fp: fingerprint,
        fp1: await aesenc(`${APP_ID}:${fingerprint}`, aesKey),
        'x-guide': xGuide,
        'x-sign': await aesenc(signStr, aesKey),
        'x-code': Date.now().toString(),
    };
}

// Upload image to Live3D
async function uploadImage(imageBuffer, filename) {
    const ch = await genHeaders('upload');
    
    const formData = new FormData();
    formData.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), filename);
    formData.append('fn_name', 'demo-image-editor');
    formData.append('request_from', '9');
    formData.append('origin_from', '8f3f0c7387123ae0');
    
    const response = await fetch(`${BASE_URL}/aitools/upload-img`, {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json, text/plain, */*',
            'origin': 'https://live3d.io',
            'referer': 'https://live3d.io/',
            'theme-version': TH_VER,
            ...ch,
        },
        body: formData,
    });
    
    const result = await response.json();
    
    if (!result?.data?.path) {
        throw new Error('Upload failed: ' + JSON.stringify(result));
    }
    
    return { path: result.data.data.path, fp: ch.fp };
}

// Create AI editing job
async function createJob(remotePath, prompt, fp) {
    const ch = await genHeaders('create', fp);
    
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
        origin_from: '8f3f0c7387123ae0',
    };
    
    const response = await fetch(`${BASE_URL}/aitools/of/create`, {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json, text/plain, */*',
            'origin': 'https://live3d.io',
            'referer': 'https://live3d.io/',
            'theme-version': TH_VER,
            'Content-Type': 'application/json',
            ...ch,
        },
        body: JSON.stringify(payload),
    });
    
    const result = await response.json();
    
    if (!result?.data?.task_id) {
        throw new Error('Job creation failed: ' + JSON.stringify(result));
    }
    
    return result.data.data.task_id;
}

// Check job status
async function checkJob(taskId, fp) {
    const ch = await genHeaders('check', fp);
    
    const payload = {
        task_id: taskId,
        fn_name: 'demo-image-editor',
        call_type: 3,
        request_from: 9,
        origin_from: '8f3f0c7387123ae0',
    };
    
    const response = await fetch(`${BASE_URL}/aitools/of/check-status`, {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json, text/plain, */*',
            'origin': 'https://live3d.io',
            'referer': 'https://live3d.io/',
            'theme-version': TH_VER,
            'Content-Type': 'application/json',
            ...ch,
        },
        body: JSON.stringify(payload),
    });
    
    const result = await response.json();
    return result?.data?.data;
}

// Main processing function
async function processImage(imageBuffer, prompt, filename = 'image.jpg') {
    try {
        // Step 1: Upload image
        const upload = await uploadImage(imageBuffer, filename);
        
        // Step 2: Create job
        const taskId = await createJob(upload.path, prompt, upload.fp);
        
        // Step 3: Poll for result
        let result;
        let tries = 0;
        const maxTries = 30;
        
        do {
            await new Promise(r => setTimeout(r, 4000));
            result = await checkJob(taskId, upload.fp);
            tries++;
            
            if (tries > maxTries) {
                throw new Error('Timeout - Server taking too long to respond');
            }
        } while (result?.status !== 2);
        
        if (!result?.result_image) {
            throw new Error('No result received from server');
        }
        
        // Step 4: Fetch result image
        const resultUrl = 'https://temp.live3d.io/' + result.result_image;
        const imageResponse = await fetch(resultUrl);
        const resultBuffer = await imageResponse.arrayBuffer();
        
        return {
            success: true,
            image: resultBuffer,
            url: resultUrl,
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}

// Helper: Convert base64 to buffer
function base64ToBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Handle GET request
async function handleGet(request, url) {
    const prompt = url.searchParams.get('prompt');
    const imageUrl = url.searchParams.get('image_url');
    const imageBase64 = url.searchParams.get('image_base64');
    
    // Validate required fields
    if (!prompt) {
        return new Response(JSON.stringify({ 
            error: 'Missing required field: prompt',
            usage: {
                method: 'GET',
                params: {
                    prompt: 'text (required)',
                    image_url: 'url to image (required if no image_base64)',
                    image_base64: 'base64 encoded image (required if no image_url)'
                },
                example: '/?prompt=make%20him%20smile&image_url=https://example.com/image.jpg'
            }
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    if (!imageUrl && !imageBase64) {
        return new Response(JSON.stringify({ 
            error: 'Missing required field: either image_url or image_base64 is required'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    try {
        let imageBuffer;
        
        // Get image from URL
        if (imageUrl) {
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                throw new Error(`Failed to fetch image from URL: ${imageResponse.status}`);
            }
            imageBuffer = await imageResponse.arrayBuffer();
        }
        // Get image from base64
        else if (imageBase64) {
            imageBuffer = base64ToBuffer(imageBase64);
        }
        
        // Process the image
        const result = await processImage(imageBuffer, prompt, 'image.jpg');
        
        if (!result.success) {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // Return success response
        const base64Image = btoa(String.fromCharCode(...new Uint8Array(result.image)));
        
        return new Response(JSON.stringify({
            success: true,
            image: `data:image/jpeg;base64,${base64Image}`,
            url: result.url,
            prompt: prompt,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
        
    } catch (error) {
        console.error('GET request error:', error);
        
        return new Response(JSON.stringify({ 
            error: 'Processing failed',
            details: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// Handle POST request
async function handlePost(request) {
    try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        const prompt = formData.get('prompt');
        
        // Validate inputs
        if (!imageFile || !prompt) {
            return new Response(JSON.stringify({ 
                error: 'Missing required fields',
                required: ['image', 'prompt']
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // Validate image type
        if (!imageFile.type.startsWith('image/')) {
            return new Response(JSON.stringify({ error: 'File must be an image' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // Get image buffer
        const imageBuffer = await imageFile.arrayBuffer();
        const filename = imageFile.name || 'image.jpg';
        
        // Process image
        const result = await processImage(imageBuffer, prompt, filename);
        
        if (!result.success) {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // Return success response
        const base64Image = btoa(String.fromCharCode(...new Uint8Array(result.image)));
        
        return new Response(JSON.stringify({
            success: true,
            image: `data:image/jpeg;base64,${base64Image}`,
            url: result.url,
            prompt: prompt,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
        
    } catch (error) {
        console.error('POST request error:', error);
        
        return new Response(JSON.stringify({ 
            error: 'Internal server error',
            details: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// Cloudflare Worker handler
export default {
    async fetch(request, env, ctx) {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };
        
        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        const url = new URL(request.url);
        
        // Serve homepage with documentation for GET requests without params
        if (request.method === 'GET' && url.pathname === '/' && !url.searchParams.has('prompt')) {
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Live3D AI Image Editor API</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                    h1 { color: #333; }
                    .endpoint { background: #f4f4f4; padding: 10px; border-radius: 5px; margin: 10px 0; }
                    code { background: #e0e0e0; padding: 2px 5px; border-radius: 3px; }
                    pre { background: #333; color: #fff; padding: 10px; border-radius: 5px; overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>🎨 Live3D AI Image Editor API</h1>
                <p>Transform images with AI-powered editing!</p>
                
                <h2>📡 Endpoint</h2>
                <div class="endpoint">
                    <code>${url.origin}</code>
                </div>
                
                <h2>📤 POST Method (File Upload)</h2>
                <pre>
curl -X POST ${url.origin} \\
  -F "image=@/path/to/image.jpg" \\
  -F "prompt=make him smile"</pre>
                
                <h2>🌐 GET Method (URL or Base64)</h2>
                <pre>
# Using image URL
curl "${url.origin}/?prompt=add%20sunglasses&image_url=https://example.com/image.jpg"

# Using base64 image
curl "${url.origin}/?prompt=change%20background&image_base64=data:image/jpeg;base64,/9j/4AAQ..."</pre>
                
                <h2>📝 Response Format</h2>
                <pre>
{
  "success": true,
  "image": "data:image/jpeg;base64,...",
  "url": "https://temp.live3d.io/...",
  "prompt": "your prompt"
}</pre>
                
                <h2>✨ Example Prompts</h2>
                <ul>
                    <li><code>make him smile</code></li>
                    <li><code>add sunglasses</code></li>
                    <li><code>change background to beach</code></li>
                    <li><code>put a hat on his head</code></li>
                    <li><code>make her look like a cartoon</code></li>
                </ul>
                
                <p>⚡ Powered by Live3D AI | Cloudflare Worker</p>
            </body>
            </html>
            `;
            
            return new Response(html, {
                status: 200,
                headers: { 'Content-Type': 'text/html', ...corsHeaders },
            });
        }
        
        // Route requests
        try {
            if (request.method === 'GET') {
                return await handleGet(request, url);
            } else if (request.method === 'POST') {
                return await handlePost(request);
            } else {
                return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                    status: 405,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                });
            }
        } catch (error) {
            console.error('Worker error:', error);
            
            return new Response(JSON.stringify({ 
                error: 'Internal server error',
                details: error.message 
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }
    },
};