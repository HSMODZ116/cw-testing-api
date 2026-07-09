// Cloudflare Worker - Temporary Email API
// Original Python code converted to JavaScript for Cloudflare Workers

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling
    if (path === '/tmail/gen') {
      return handleGenerateTempMail(request);
    } else if (path === '/tmail/cmail') {
      return handleCheckTempMail(request);
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Not found',
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

const BASE_URL = 'https://api.mail.tm';
const MAX_MESSAGE_LENGTH = 4000;

// Helper functions
function generateRandomUsername(length = 8) {
  return Array.from({ length }, () => 
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join('');
}

function generateRandomPassword(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function shortIdGenerator(email) {
  const uniqueString = email + Date.now();
  let hash = 0;
  for (let i = 0; i < uniqueString.length; i++) {
    const char = uniqueString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 10);
}

async function getDomain() {
  try {
    const response = await fetch(`${BASE_URL}/domains`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      return data[0].domain;
    } else if (data['hydra:member'] && data['hydra:member'].length > 0) {
      return data['hydra:member'][0].domain;
    }
    return null;
  } catch (error) {
    console.error('Error fetching domain:', error);
    return null;
  }
}

async function createAccount(email, password) {
  try {
    const response = await fetch(`${BASE_URL}/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ address: email, password })
    });
    
    if (response.ok) {
      return await response.json();
    }
    console.error('Error creating account:', response.status);
    return null;
  } catch (error) {
    console.error('Error in createAccount:', error);
    return null;
  }
}

async function getToken(email, password) {
  try {
    const response = await fetch(`${BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ address: email, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.token;
    }
    console.error('Error fetching token:', response.status);
    return null;
  } catch (error) {
    console.error('Error in getToken:', error);
    return null;
  }
}

async function listMessages(token) {
  try {
    const response = await fetch(`${BASE_URL}/messages`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    } else if (data['hydra:member']) {
      return data['hydra:member'];
    }
    return [];
  } catch (error) {
    console.error('Error in listMessages:', error);
    return [];
  }
}

async function getMessageDetails(token, messageId) {
  try {
    const response = await fetch(`${BASE_URL}/messages/${messageId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      return await response.json();
    }
    console.error('Error fetching message details:', response.status);
    return null;
  } catch (error) {
    console.error('Error in getMessageDetails:', error);
    return null;
  }
}

function extractTextFromHTML(htmlContent) {
  // Simple HTML to text conversion (no BeautifulSoup in JS)
  let text = htmlContent
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Truncate if too long
  if (text.length > MAX_MESSAGE_LENGTH) {
    return text.substring(0, MAX_MESSAGE_LENGTH - 100) + '... [message truncated]';
  }
  return text;
}

// Handlers
async function handleGenerateTempMail(request) {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const password = url.searchParams.get('password');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const domain = await getDomain();
    if (!domain) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to retrieve domain from mail.tm API',
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const email = username ? `${username}@${domain}` : `${generateRandomUsername()}@${domain}`;
    const pwd = password || generateRandomPassword();
    
    const account = await createAccount(email, pwd);
    if (!account) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to create account. Username may already be taken.',
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = await getToken(email, pwd);
    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to retrieve token',
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const shortId = shortIdGenerator(email);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        email,
        password: pwd,
        token,
        short_id: shortId
      },
      api_owner: '@ISmartCoder',
      api_updates: 't.me/abirxdhackz'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Unexpected error generating temp mail:', error);
    return new Response(JSON.stringify({
      success: false,
      error: `Unexpected error: ${error.message}`,
      api_owner: '@ISmartCoder',
      api_updates: 't.me/abirxdhackz'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleCheckTempMail(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (!token) {
    return new Response(JSON.stringify({
      success: false,
      error: "Missing 'token' parameter",
      api_owner: '@ISmartCoder',
      api_updates: 't.me/abirxdhackz'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const messages = await listMessages(token);
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        data: [],
        message: 'No messages found or invalid token',
        api_owner: '@ISmartCoder',
        api_updates: 't.me/abirxdhackz'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const formattedMessages = [];
    for (const msg of messages.slice(0, 10)) {
      const details = await getMessageDetails(token, msg.id);
      if (details) {
        const messageText = details.html ? 
          extractTextFromHTML(details.html) : 
          details.text || 'Content not available';
        
        formattedMessages.push({
          id: msg.id,
          from: msg.from.address,
          subject: msg.subject,
          content: messageText
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: formattedMessages,
      api_owner: '@ISmartCoder',
      api_updates: 't.me/abirxdhackz'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Unexpected error checking mail:', error);
    return new Response(JSON.stringify({
      success: false,
      error: `Unexpected error: ${error.message}`,
      api_owner: '@ISmartCoder',
      api_updates: 't.me/abirxdhackz'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}