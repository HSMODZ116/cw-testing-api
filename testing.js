export default {
  async fetch(request) {
    // CORS Preflight handle
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
    let query = url.searchParams.get('query') || url.searchParams.get('q');

    // Agar POST request hai toh body se read karein
    if (!query && request.method === 'POST') {
      try {
        const text = await request.text();
        const params = new URLSearchParams(text);
        query = params.get('query') || params.get('q');
      } catch (e) {
        // Ignore
      }
    }

    if (!query) {
      return jsonResponse({ 
        success: false, 
        error: "Missing 'query' parameter. Use ?query=03001234567" 
      }, 400);
    }

    // ---------- PAKDATASOLUTIONS.COM TARGET ----------
    const records = await fetchPakDataSolutions(query);

    // Agar record nahi mila
    if (!records || records.length === 0) {
      return jsonResponse({
        success: true,
        searchedPhone: query,
        records: "No Record Found",
        developer: "Haseeb Sahil"
      });
    }

    return jsonResponse({
      success: true,
      searchedPhone: query,
      records: records,
      developer: "Haseeb Sahil"
    });
  }
};

// ---------- HELPER: JSON RESPONSE ----------
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ---------- FETCH & PARSE: PAKDATASOLUTIONS.COM ----------
async function fetchPakDataSolutions(value) {
  const TARGET_URL = "https://pakdatasolutions.com/";

  // Payload (Form Data)
  const payload = new URLSearchParams({
    search_term: value
  });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://pakdatasolutions.com",
    "Referer": "https://pakdatasolutions.com/",
    "Accept": "text/html,application/xhtml+xml"
  };

  try {
    const response = await fetch(TARGET_URL, {
      method: "POST",
      headers: headers,
      body: payload.toString()
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Parser for pakdatasolutions.com HTML
    return parsePakDataHtml(html);

  } catch (e) {
    return [];
  }
}

// ---------- HTML PARSER (Based on your response.html) ----------
function parsePakDataHtml(html) {
  const rows = [];

  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;
  let regDate = null;
  let network = null;

  // 1. Extract Name (Value inside "Full Name" div)
  // HTML mein label ke saath value dhoondh rahe hain
  const nameMatch = html.match(/FULL NAME[\s\S]*?<\/div>\s*<div[^>]*>([^<]+)/i);
  if (nameMatch) name = nameMatch[1].trim();

  // 2. Extract Mobile Number
  const mobileMatch = html.match(/MOBILE NUMBER[\s\S]*?<\/div>\s*<div[^>]*>([0-9]+)/i);
  if (mobileMatch) mobile = mobileMatch[1].trim();

  // 3. Extract CNIC
  const cnicMatch = html.match(/CNIC NUMBER[\s\S]*?<\/div>\s*<div[^>]*>([0-9]+)/i);
  if (cnicMatch) cnic = cnicMatch[1].trim();

  // 4. Extract Address
  const addressMatch = html.match(/ADDRESS[\s\S]*?<\/div>\s*<div[^>]*>([^<]+)/i);
  if (addressMatch) address = addressMatch[1].trim();

  // 5. Extract Registration Date
  const regMatch = html.match(/REGISTRATION DATE[\s\S]*?<\/div>\s*<div[^>]*>([^<]+)/i);
  if (regMatch) regDate = regMatch[1].trim();

  // 6. Extract Network (Purple badge ke andar text)
  const netMatch = html.match(/net-badge[^>]*>[\s\S]*?<i[^>]*>[\s\S]*?<\/i>\s*([A-Za-z]+)/i);
  if (netMatch) network = netMatch[1].trim();

  // Agar kuch bhi mila toh push karein
  if (name || mobile || cnic || address) {
    rows.push({
      Mobile: mobile || null,
      Name: name || null,
      CNIC: cnic || null,
      Address: address || null,
      Network: network || null,
      RegistrationDate: regDate || null
    });
  }

  return rows;
}