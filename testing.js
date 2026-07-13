export default {
  async fetch(request) {
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

    if (!query && request.method === 'POST') {
      try {
        const text = await request.text();
        const params = new URLSearchParams(text);
        query = params.get('query') || params.get('q');
      } catch (e) {}
    }

    if (!query) {
      return jsonResponse({ 
        success: false, 
        error: "Missing 'query' parameter. Use ?query=03001234567" 
      }, 400);
    }

    const cleaned = query.replace(/[^0-9]/g, '');
    if (!/^(03\d{9}|92\d{10})$/.test(cleaned)) {
      return jsonResponse({
        success: false,
        error: "Only mobile numbers allowed (03XXXXXXXXX or 92XXXXXXXXXX). CNIC not allowed."
      }, 400);
    }

    const records = await fetchPakDataSolutions(cleaned);

    if (!records || records.length === 0) {
      return jsonResponse({
        success: true,
        searchedPhone: cleaned,
        records: "No Record Found",
        developer: "Haseeb Sahil"
      });
    }

    return jsonResponse({
      success: true,
      searchedPhone: cleaned,
      records: records,
      developer: "Haseeb Sahil"
    });
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function fetchPakDataSolutions(value) {
  const TARGET_URL = "https://pakdatasolutions.com/";
  const payload = new URLSearchParams({ search_term: value });
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
    return parsePakDataHtml(html);
  } catch (e) {
    return [];
  }
}

function parsePakDataHtml(html) {
  const rows = [];
  let mobile = null, name = null, cnic = null, address = null, regDate = null;

  const nameMatch = html.match(/FULL NAME[\s\S]*?<\/div>\s*<div[^>]*>([^<]+)/i);
  if (nameMatch) name = nameMatch[1].trim();

  const mobileMatch = html.match(/MOBILE NUMBER[\s\S]*?<\/div>\s*<div[^>]*>([0-9]+)/i);
  if (mobileMatch) mobile = mobileMatch[1].trim();

  const cnicMatch = html.match(/CNIC NUMBER[\s\S]*?<\/div>\s*<div[^>]*>([0-9]+)/i);
  if (cnicMatch) cnic = cnicMatch[1].trim();

  const addressMatch = html.match(/ADDRESS[\s\S]*?<\/div>\s*<div[^>]*>([^<]+)/i);
  if (addressMatch) address = addressMatch[1].trim();

  const regMatch = html.match(/REGISTRATION DATE[\s\S]*?<\/div>\s*<div[^>]*>([^<]+)/i);
  if (regMatch) regDate = regMatch[1].trim();

  if (name || mobile || cnic || address) {
    rows.push({
      Mobile: mobile || null,
      Name: name || null,
      CNIC: cnic || null,
      Address: address || null,
      RegistrationDate: regDate || null
    });
  }

  return rows;
}