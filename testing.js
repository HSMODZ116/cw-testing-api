export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/start-task") {
        return await handleStartTask(url);
      } else if (path === "/get-task") {
        return await handleGetTask(url);
      }

      return new Response("Not Found", { status: 404 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  origin: "https://ghibliai.ai",
  referer: "https://ghibliai.ai/",
  "user-agent": "Mozilla/5.0",
};

// ─── /start-task ───────────────────────────────────────────────
async function handleStartTask(url) {
  const imageUrl = url.searchParams.get("imageUrl");
  const prompt =
    url.searchParams.get("prompt") ||
    "Please convert this image into Studio Ghibli art style with the Ghibli AI generator.";

  if (!imageUrl) {
    return new Response(
      JSON.stringify({ error: "Missing imageUrl parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const payload = {
    imageUrl,
    prompt,
    sessionId: generateUUID(),
    timestamp: Date.now().toString(),
  };

  const createResp = await fetch("https://ghibliai.ai/api/transform-stream", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(payload),
  });

  const createData = await createResp.json();
  if (!createResp.ok || !createData.taskId) {
    return new Response(
      JSON.stringify({ error: "Failed to create task" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ taskId: createData.taskId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── /get-task ───────────────────────────────────────────────
async function handleGetTask(url) {
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return new Response(JSON.stringify({ error: "Missing taskId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pollUrl = `https://ghibliai.ai/api/transform-stream?taskId=${taskId}`;
  const pollResp = await fetch(pollUrl, { headers: HEADERS });
  const pollData = await pollResp.json();

  if (!pollResp.ok || pollData.status === "failed") {
    return new Response(JSON.stringify({ error: "Task failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!pollData.imageUrl) {
    return new Response(
      JSON.stringify({ status: pollData.status || "processing" }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const imgResp = await fetch(pollData.imageUrl);
  const imgBuffer = await imgResp.arrayBuffer();

  const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  const CRLF = "\r\n";
  let body = "";
  body += `--${boundary}${CRLF}`;
  body += `Content-Disposition: form-data; name="file"; filename="generated.png"${CRLF}`;
  body += `Content-Type: image/png${CRLF}${CRLF}`;
  const bodyStart = new TextEncoder().encode(body);
  const bodyEnd = new TextEncoder().encode(`${CRLF}--${boundary}--${CRLF}`);

  const combinedBody = new Uint8Array(
    bodyStart.length + imgBuffer.byteLength + bodyEnd.length
  );
  combinedBody.set(bodyStart, 0);
  combinedBody.set(new Uint8Array(imgBuffer), bodyStart.length);
  combinedBody.set(bodyEnd, bodyStart.length + imgBuffer.byteLength);

  const uploadResp = await fetch("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: combinedBody,
  });

  const uploadJson = await uploadResp.json();
  if (
    !uploadResp.ok ||
    uploadJson.status !== "success" ||
    !uploadJson.data?.url
  ) {
    return new Response(JSON.stringify({ error: "Upload failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const originalUrl = uploadJson.data.url;
  const urlParsed = new URL(originalUrl);
  urlParsed.pathname = "/dl" + urlParsed.pathname;

  return new Response(JSON.stringify({ status: "done", url: urlParsed.href }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
