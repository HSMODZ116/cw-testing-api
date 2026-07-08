/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           Super Resolution API — Cloudflare Worker              ║
 * ║                                                                  ║
 * ║  Creator  : https://t.me/Ashlynn_Repository                     ║
 * ║  Version  : 1.0.0                                               ║
 * ║  Platform : Cloudflare Workers                                   ║
 * ║  Powered  : Visual Paradigm Super Resolution API                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ─────────────────────────────────────────────────────────────────
 *  DEPLOYMENT GUIDE
 * ─────────────────────────────────────────────────────────────────
 *
 *  OPTION A — Cloudflare Dashboard (easiest, no CLI needed)
 *  ─────────────────────────────────────────────────────────
 *  1. Go to https://workers.cloudflare.com and sign in
 *     (or create a free account — no credit card required).
 *
 *  2. Click "Create Application" → "Create Worker".
 *
 *  3. Give your worker a name (e.g. "super-resolution"), then click
 *     "Deploy" to create it with the default Hello World code.
 *
 *  4. Click "Edit code" to open the online editor.
 *
 *  5. Select ALL the default code in the editor and DELETE it.
 *
 *  6. Paste THIS entire file into the editor.
 *
 *  7. Click "Deploy" (top-right). Done! ✅
 *     Your endpoint will be:
 *     https://<worker-name>.<your-subdomain>.workers.dev
 *
 * ─────────────────────────────────────────────────────────────────
 *
 *  OPTION B — Wrangler CLI
 *  ────────────────────────
 *  1. npm install -g wrangler
 *  2. wrangler login
 *  3. wrangler deploy worker.js --name super-resolution --compatibility-date 2024-01-01
 *
 * ─────────────────────────────────────────────────────────────────
 *
 *  USAGE
 *  ──────
 *  GET  ?imageUrl=https://example.com/photo.jpg
 *  POST {"imageUrl": "https://example.com/photo.jpg"}
 *  POST {"imageUrl": "data:image/png;base64,<base64string>"}
 *
 *  Response: raw upscaled image binary (same content-type as input)
 *
 * ─────────────────────────────────────────────────────────────────
 */

// ─── CORS & Custom Headers ────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma',
  'Access-Control-Expose-Headers': 'X-Powered-By, X-API-Version, X-Response-Time',
  'Access-Control-Max-Age': '86400',
  'X-Powered-By': 'Cloudflare Workers',
  'X-API-Version': '1.0',
  'X-Creator': 'https://t.me/Ashlynn_Repository',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Access-Control-Allow-Credentials': 'false',
};

class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isApiError = true;
  }
}

// ─── API Client ───────────────────────────────────────────────────
class ApiClient {
  constructor() {
    this.baseUrl = 'https://ai-services.visual-paradigm.com/api/super-resolution/file';
    this.timeout = 25000;
  }

  async _processInput(imageUrl) {
    if (imageUrl instanceof ArrayBuffer || ArrayBuffer.isView(imageUrl)) {
      return {
        buffer: imageUrl instanceof ArrayBuffer ? imageUrl : imageUrl.buffer,
        contentType: 'image/png',
      };
    }

    if (typeof imageUrl !== 'string') {
      throw new ApiError('Invalid input: must be a URL string or base64 string.', 400);
    }

    if (imageUrl.startsWith('http')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
          throw new ApiError(`Failed to download image. Status: ${response.status}`, 400);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          throw new ApiError(
            `URL does not point to an image file. Found: ${contentType || 'unknown'}`,
            400
          );
        }
        const buffer = await response.arrayBuffer();
        return { buffer, contentType };
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof ApiError) throw err;
        throw new ApiError('Failed to download image from URL.', 400);
      }
    }

    try {
      const match = imageUrl.match(/^data:(image\/.+?);base64,/);
      const base64Data = match ? imageUrl.substring(match[0].length) : imageUrl;
      const contentType = match ? match[1] : 'image/png';

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { buffer: bytes.buffer, contentType };
    } catch {
      throw new ApiError('Invalid base64 string.', 400);
    }
  }

  async generate({ imageUrl }) {
    const { buffer, contentType } = await this._processInput(imageUrl);

    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
    const enc = new TextEncoder();

    const preamble = enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const closing = enc.encode(`\r\n--${boundary}--\r\n`);

    const parts = [preamble, new Uint8Array(buffer), closing];
    const total = parts.reduce((n, p) => n + p.byteLength, 0);
    const body = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.byteLength;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Accept: '*/*',
        },
        body: body.buffer,
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      throw new ApiError('External API failed to respond.', 502);
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw new ApiError(
        `External API returned an error. Status: ${response.status}`,
        response.status
      );
    }

    const resultBuffer = await response.arrayBuffer();
    if (!resultBuffer || resultBuffer.byteLength === 0) {
      throw new ApiError('External API returned an empty response.', 502);
    }

    return { resultBuffer, contentType };
  }
}

export default {
  async fetch(request) {
    const startTime = Date.now();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!['GET', 'POST'].includes(request.method)) {
      return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let imageUrl = null;

    try {
      if (request.method === 'POST') {
        const ct = request.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const body = await request.json();
          imageUrl = body.imageUrl ?? null;
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(await request.text());
          imageUrl = params.get('imageUrl');
        } else {
          try {
            const body = await request.json();
            imageUrl = body.imageUrl ?? null;
          } catch {
            imageUrl = null;
          }
        }
      } else {
        imageUrl = new URL(request.url).searchParams.get('imageUrl');
      }

      if (!imageUrl) {
        return new Response(JSON.stringify({ error: "Parameter 'imageUrl' is required." }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const { resultBuffer, contentType } = await new ApiClient().generate({ imageUrl });
      const elapsed = Date.now() - startTime;

      return new Response(resultBuffer, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'X-Response-Time': `${elapsed}ms`,
        },
      });

    } catch (err) {
      console.error('Worker Error:', err instanceof Error ? err.message : err);
      const elapsed = Date.now() - startTime;

      if (err instanceof ApiError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'X-Response-Time': `${elapsed}ms`,
          },
        });
      }

      return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Response-Time': `${elapsed}ms`,
        },
      });
    }
  },
};