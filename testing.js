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
  const TARGET_URL = "https://simownerdetailspk.com/numberDetails.php"; // Yahan Telenor ka URL bhi aa sakta hai

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

  // SMART PARSER: Check karein ke HTML mein Table hai ya nahi
  if (html.includes('<table')) {
    return parseTableHtml(html); // Purani table parser
  } else {
    return parseTelenorHtml(html); // Naya Telenor parser
  }
}

/* ---------------------- Parser 1: For Tables (Jazz/Zong/etc) ---------------------- */
function parseTableHtml(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  let rowIndex = 0;

  while ((match = rowRegex.exec(html))) {
    const rowHtml = match[1];
    const cols = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );

    if (rowIndex === 0) {
      rowIndex++;
      continue;
    }

    if (cols.length >= 4) { 
      rows.push({
        Mobile: cols[0] || null,
        Name: cols[1] || null,
        CNIC: cols[2] || null,
        Address: cols[3] || null
      });
    }
    rowIndex++;
  }
  return rows;
}

/* ---------------------- Parser 2: For Telenor (Certificate Style) ---------------------- */
function parseTelenorHtml(html) {
  const rows = [];
  
  // Telenor layout mein MSISDN aur Name dhoondhna
  const msisdnMatch = html.match(/MSISDN\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
  const nameMatch = html.match(/border-bottom:2px solid black;">([^<]+)/g);
  const cnicMatch = html.match(/CNIC No\.\s*<\/td>\s*<td[^>]*>\s*([\d]+)/i);

  let name = null;
  let address = null;

  // Name aur Address nikalein (HTML structure ke hisaab se)
  if (nameMatch && nameMatch.length >= 3) {
    // Pehli line Name, doosri Address hoti hai usually
    name = nameMatch[1].replace(/.*>/, '').trim(); 
    if (nameMatch.length >= 3) {
       address = nameMatch[2].replace(/.*>/, '').trim();
    }
  }

  // Agar exact CNIC na mile, toh Address line ke baad wala lo
  if (!cnicMatch && nameMatch && nameMatch.length >= 4) {
      // Assume 4th match is CNIC for this specific layout
  }

  // Clean Data return karein
  if (msisdnMatch) {
    rows.push({
      Mobile: msisdnMatch[1] || null, // MSISDN number
      Name: name || null,
      CNIC: cnicMatch ? cnicMatch[1] : null,
      Address: address || null
    });
  }

  return rows;
}