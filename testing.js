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
        error: "Missing 'query' parameter." 
      }, 400);
    }

    const cleaned = query.replace(/[^0-9]/g, '');

    // ✅ CNIC & MOBILE BOTH ALLOWED (13 digits or 11/12 digits mobile)
    if (!/^(\d{11}|\d{12}|\d{13})$/.test(cleaned)) {
      return jsonResponse({
        success: false,
        error: "Invalid format. Use 03XXXXXXXXX (11 digits) or 13-digit CNIC."
      }, 400);
    }

    const records = await fetchPakSimSite(cleaned);

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

async function fetchPakSimSite(value) {
  const TARGET_URL = "https://paksim.site/api/getData";
  
  const payload = JSON.stringify({
    number: value
  });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    "Content-Type": "application/json",
    "Origin": "https://paksim.site",
    "Referer": "https://paksim.site/",
    "Accept": "application/json, text/plain, */*",
    "Cookie": "cf_clearance=LgFJAv6hmRYv5zt3aZDxRVVg3pY9_6ZviL2p_tLgf; __cf_bm=1; _ga=...; _gid=...; _ga_...;"
  };

  try {
    const response = await fetch(TARGET_URL, {
      method: "POST",
      headers: headers,
      body: payload
    });

    if (!response.ok) return [];
    const json = await response.json();

    if (json.success && json.data) {
      return [{
        Mobile: json.data.number || null,
        Name: json.data.name || null,
        CNIC: json.data.cnic || null,
        Address: json.data.address || null
      }];
    }
    return [];
  } catch (e) {
    return [];
  }
}