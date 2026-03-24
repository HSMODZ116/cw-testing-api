/**
 * AI CUSTOM TRANSFORMER - Fitur ke-117
 * Engine: GPT-Image-1 (Strict Custom Prompt)
 * Status: PRO (Prompt Mandatory)
 * Creator: Xena
 */

async function convertAIImage(imageUrl, prompt) {
    // 1. Download gambar & ubah ke Base64
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Gagal ambil gambar dari URL.');
    
    const arrayBuffer = await response.arrayBuffer();
    const mime = response.headers.get("content-type") || "image/jpeg";
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const imgData = `data:${mime};base64,${base64}`;

    // 2. Siapkan Payload JSON
    const payload = JSON.stringify({
        image: imgData,
        model: "gpt-image-1",
        n: 1,
        prompt: prompt,
        quality: "low",
        size: "1024x1024"
    });

    // 3. Tembak Netlify Proxy Ghibli
    const proxyResponse = await fetch("https://ghibli-proxy.netlify.app/.netlify/functions/ghibli-proxy", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "origin": "https://overchat.ai",
            "referer": "https://overchat.ai/",
            "user-agent": "Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36..."
        },
        body: payload
    });
    
    const res = await proxyResponse.json();

    if (!res?.success || !res?.data?.[0]?.b64_json) {
        throw new Error(res?.message || "AI gagal memproses gambar dengan prompt tersebut.");
    }

    // Convert base64 to Uint8Array
    const binaryString = atob(res.data[0].b64_json);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes;
}

export default {
    async fetch(request, env, ctx) {
        // Handle CORS
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }

        const url = new URL(request.url);
        
        // Support both GET and POST methods
        let params = {};
        if (request.method === "GET") {
            params = {
                url: url.searchParams.get("url"),
                prompt: url.searchParams.get("prompt")
            };
        } else if (request.method === "POST") {
            try {
                const body = await request.json();
                params = {
                    url: body.url,
                    prompt: body.prompt
                };
            } catch (e) {
                params = {
                    url: url.searchParams.get("url"),
                    prompt: url.searchParams.get("prompt")
                };
            }
        }

        const { url: imageUrl, prompt } = params;

        // Validasi Ketat
        if (!imageUrl) {
            return new Response(JSON.stringify({
                status: false,
                creator: "Xena",
                error: "Masukkan parameter 'url' gambar!"
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }
        
        if (!prompt) {
            return new Response(JSON.stringify({
                status: false,
                creator: "Xena",
                error: "Prompt wajib diisi! Contoh: prompt=make it ghibli style"
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        try {
            const resultBuffer = await convertAIImage(imageUrl, prompt);
            
            // Kirim hasil sebagai Image PNG
            return new Response(resultBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "image/png",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache"
                }
            });

        } catch (err) {
            return new Response(JSON.stringify({
                status: false,
                creator: "Xena",
                error: err.message
            }), {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }
    }
};