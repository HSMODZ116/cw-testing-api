// Cloudflare Worker for Bulk SMS Sender (Yeastar Middleware)
// Target URL: http://188.34.195.15:3046/

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS Headers (Allow your HTML to talk to Worker)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle Preflight OPTIONS request
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // --- API ROUTES ---

    // 1. Send Bulk SMS
    if (path === '/api/bulk-send' && method === 'POST') {
      try {
        const { numbers, message } = await request.json();
        if (!numbers || !message) {
          return new Response(JSON.stringify({ error: 'Numbers and message are required' }), { 
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }

        // Split numbers and create a job
        const numberList = numbers.split('\n').map(n => n.trim()).filter(n => n);
        const jobId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        
        // Store job in Cloudflare KV (Use env.JOBS if you bind KV, or use in-memory for testing)
        // Note: For persistent deployment, you need to bind a KV namespace named 'JOBS' in Worker settings.
        // For demo purpose, we will use a global Map (but this resets on cold start)
        if (!globalThis.smsJobs) globalThis.smsJobs = new Map();
        
        globalThis.smsJobs.set(jobId, {
          total: numberList.length,
          sent: 0,
          success: 0,
          failed: 0,
          lastNumber: null,
          lastSuccess: null,
          done: false,
          error: null,
          // In a real scenario, you'd fire off a background task here.
          // Since Workers don't have background tasks easily, we will process 
          // the request synchronously in this simple version.
        });

        // Trigger the sending process in the background (simulated)
        // To truly do it async without blocking response, we use ctx.waitUntil
        ctx.waitUntil(processBulkSend(jobId, numberList, message));

        return new Response(JSON.stringify({ jobId, count: numberList.length }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 2. Get Job Progress (Polling)
    if (path.startsWith('/api/progress/') && method === 'GET') {
      const jobId = path.split('/').pop();
      if (!globalThis.smsJobs || !globalThis.smsJobs.has(jobId)) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const job = globalThis.smsJobs.get(jobId);
      return new Response(JSON.stringify(job), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Test Ports
    if (path === '/api/test-ports' && method === 'POST') {
      try {
        const { destination } = await request.json();
        if (!destination) {
          return new Response(JSON.stringify({ error: 'Destination required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Test ports 1-8
        const results = [];
        for (let i = 1; i <= 8; i++) {
          try {
            const res = await sendYeastarSMS(destination, 'Test SMS from Port ' + i, i);
            results.push({ port: i, ok: res.ok, detail: res.ok ? 'Success' : res.error });
          } catch (e) {
            results.push({ port: i, ok: false, detail: e.message });
          }
        }
        
        return new Response(JSON.stringify(results), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 4. Middleware Logs
    if (path === '/api/middleware-logs' && method === 'GET') {
      try {
        const res = await fetch('http://188.34.195.15:3046/api/middleware-logs');
        const data = await res.text();
        // Return lines as array
        const lines = data.split('\n').filter(l => l.trim());
        return new Response(JSON.stringify(lines), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify(['[ERR] Could not connect to middleware server']), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Default 404
    return new Response('Not Found', { status: 404 });
  }
};

// --- HELPER FUNCTIONS ---

async function processBulkSend(jobId, numbers, message) {
  const job = globalThis.smsJobs.get(jobId);
  const portPromises = [];
  
  // We will send 8 numbers simultaneously (using 8 ports)
  // Then wait 10 seconds for the next batch (as per your HTML note: Rate limit)
  const chunkSize = 8;
  
  for (let i = 0; i < numbers.length; i += chunkSize) {
    const chunk = numbers.slice(i, i + chunkSize);
    const currentPorts = chunk.map((num, index) => index + 1); // Port 1 to 8
    
    // Send chunk
    const sendPromises = chunk.map((num, idx) => {
      return sendYeastarSMS(num, message, currentPorts[idx])
        .then(res => {
          job.sent++;
          if (res.ok) {
            job.success++;
            job.lastSuccess = true;
          } else {
            job.failed++;
            job.lastSuccess = false;
          }
          job.lastNumber = num;
        })
        .catch(() => {
          job.sent++;
          job.failed++;
          job.lastSuccess = false;
          job.lastNumber = num;
        });
    });

    await Promise.all(sendPromises);

    // Wait 10 seconds before next batch (Rate limit)
    if (i + chunkSize < numbers.length) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  job.done = true;
}

async function sendYeastarSMS(number, text, port) {
  // Format number: add '+' if missing
  let formattedNumber = number.trim();
  if (!formattedNumber.startsWith('+')) {
    formattedNumber = '+' + formattedNumber;
  }

  // Yeastar Middleware API structure
  const payload = {
    "privilege": "all, smscommand",
    "ID": Math.floor(Math.random() * 100000), // Random ID
    "Smss": formattedNumber,
    "text": text,
    "port": port
  };

  try {
    const response = await fetch('http://188.34.195.15:3046/api/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      // Parse response to check if actual SMS was queued (Yeastar returns structure)
      const respText = await response.text();
      // Checking for Status: 1 in response (as per your screenshot)
      if (respText.includes('"Status": 1') || respText.includes('"Status":1')) {
        return { ok: true };
      } else {
        // Even if 200 OK, Yeastar might return error inside the body
        // Extract error if present
        let errorMsg = 'Unknown Yeastar error';
        try {
          const json = JSON.parse(respText);
          errorMsg = json.error || json.msg || 'Status not 1';
        } catch { /* ignore */ }
        return { ok: false, error: errorMsg };
      }
    } else {
      return { ok: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}