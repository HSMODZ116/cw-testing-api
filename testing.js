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

/* ---------------------- Helper Functions ---------------------- */

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

  // 🚀 Direct Telenor parser use karein (kyunki table nahi hai)
  return parseTelenorHtml(html);
}

/* ---------------------- Parser for Telenor Certificate Layout ---------------------- */
function parseTelenorHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  // 1. Extract Mobile (MSISDN) - Exact label se match karein
  const msisdnMatch = html.match(/MSISDN\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
  if (msisdnMatch && msisdnMatch[1]) {
      mobile = msisdnMatch[1];
  }

  // 2. Extract Name & Address - Border-bottom ke andar text dhoondhein
  // Regex jo <td style="border-bottom:2px solid black;"> ke baad ka text uthayega
  const allBorderedTexts = html.match(/border-bottom:2px solid black;">([^<]+)/g);
  
  const cleanTexts = [];
  if (allBorderedTexts) {
      for(let t of allBorderedTexts) {
          // Clean karein HTML tags aur spaces
          let clean = t.replace(/.*>/, '').trim();
          // Sirf meaningful text rakhein (dots ko ignore karein aur chhoti strings ko)
          if (clean.length > 2 && clean !== '.') {
              cleanTexts.push(clean);
          }
      }
  }

  // Extract Name (Usually pehla bada text)
  if (cleanTexts.length >= 1) {
      name = cleanTexts[0];
  }
  // Extract Address (Usually doosra bada text)
  if (cleanTexts.length >= 2) {
      address = cleanTexts[1];
  }

  // 3. Extract CNIC - Exact label "CNIC No." dhoondhein
  const cnicMatch = html.match(/CNIC No\.\s*<\/td>\s*<td[^>]*>\s*([\d]+)/i);
  if (cnicMatch && cnicMatch[1]) {
      cnic = cnicMatch[1];
  }

  // Agar CNIC nahi mila, toh alternate label "holder of CNIC No." dhoondhein
  if (!cnic) {
      const cnicMatch2 = html.match(/holder of CNIC No\.\s*<\/td>\s*<td[^>]*>\s*([\d]+)/i);
      if (cnicMatch2 && cnicMatch2[1]) {
          cnic = cnicMatch2[1];
      }
  }

  // Final JSON push
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