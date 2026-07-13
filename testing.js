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
    if (!/^(\d{11}|\d{12}|\d{13})$/.test(cleaned)) {
      return jsonResponse({
        success: false,
        error: "Invalid format. Use 03XXXXXXXXX (11 digits) or 13-digit CNIC."
      }, 400);
    }

    const records = await fetchPakSimXyz(cleaned);

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

// Hit the internal PHP API
async function fetchPakSimXyz(value) {
  const TARGET_URL = "https://paksim.xyz/psg-search.php";
  
  const payload = new URLSearchParams({
    q: value
  });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://paksim.xyz",
    "Referer": "https://paksim.xyz/",
    "Accept": "application/json, text/plain, */*"
  };

  try {
    const response = await fetch(TARGET_URL, {
      method: "POST",
      headers: headers,
      body: payload.toString()
    });

    if (!response.ok) return [];
    const json = await response.json();

    // Check karain ke API response successful hai
    if (json.ok && Array.isArray(json.data)) {
      return json.data.map(item => ({
        Mobile: item.nbr || null,
        Name: item.nam || null,
        CNIC: item.cni || null,
        Address: item.adr || null
      }));
    }
    return [];
  } catch (e) {
    return [];
  }
}