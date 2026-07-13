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
        error: "Only mobile numbers allowed (03XXXXXXXXX or 92XXXXXXXXXX)."
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

// Hit the internal JSON API
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
    // ✅ IMPORTANT: Screenshot 5 se ye cookie copy ki hai. Agar expire ho jaye, toh update karna hoga.
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

    // Check karain ke success true hai aur data exist karta hai
    if (json.success && json.data) {
      return [{
        Mobile: json.data.number || null,
        Name: json.data.name || null,
        CNIC: json.data.cnic || null,
        Address: json.data.address || null,
        // Registration date isi API mein nahi hai, agar chahiye toh "" daal sakte hain
        RegistrationDate: null 
      }];
    }
    
    return [];
  } catch (e) {
    return [];
  }
}