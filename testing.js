export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const phone = url.searchParams.get("phone") || 
                    (request.method === "POST" ? (await request.json()).phone : null);

      if (!phone) {
        return jsonResponse({ error: "Phone number required (e.g., /?phone=03001234567)" }, 400);
      }

      const records = await fetchTargetSite(phone);

      return jsonResponse({
        success: true,
        searchedPhone: phone,
        records
      });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function fetchTargetSite(value) {
  const TARGET_URL = "https://simownerdetailspk.com/numberDetails.php";

  const payload = new URLSearchParams({
    numberCnic: value,
    searchNumber: "search"
  });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://simownerdetailspk.com/",
    "Accept": "text/html,application/xhtml+xml"
  };

  const response = await fetch(TARGET_URL, {
    method: "POST",
    headers: headers,
    body: payload.toString()
  });

  const html = await response.text();

  return parseTelenorHtml(html);
}

function parseTelenorHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  const msisdnMatch = html.match(/MSISDN\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
  if (msisdnMatch && msisdnMatch[1]) {
      mobile = msisdnMatch[1];
  }

  const allBorderedTexts = html.match(/border-bottom:2px solid black;">([^<]+)/g);
  const cleanTexts = [];
  
  if (allBorderedTexts) {
      for(let t of allBorderedTexts) {
          let clean = t.replace(/.*>/, '').trim();
          if (clean.length > 2 && clean !== '.' && !clean.includes('Serial') && !clean.includes('MSISDN') && !clean.includes('Certified')) {
              cleanTexts.push(clean);
          }
      }
  }

  if (cleanTexts.length >= 1) name = cleanTexts[0];
  if (cleanTexts.length >= 2) address = cleanTexts[1];

  const cnicTdMatch = html.match(/holder of CNIC No\.\s*<\/td>\s*<td[^>]*>([^<]*)/i);
  if (cnicTdMatch && cnicTdMatch[1]) {
      let numbersOnly = cnicTdMatch[1].replace(/[^0-9]/g, '');
      if (numbersOnly.length === 13) {
          cnic = numbersOnly;
      }
  }

  if (mobile || name || cnic || address) {
    rows.push({
      Mobile: mobile || null,
      Name: name || null,
      CNIC: cnic || null,
      Address: address || null
    });
  }

  return rows;
}