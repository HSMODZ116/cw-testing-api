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

  // ✅ SMART SWITCH: Agar Table hai toh Table parser, warna Telenor parser
  if (html.includes('<table')) {
    return parseTableHtml(html);
  } else {
    return parseTelenorHtml(html);
  }
}

/* ---------------------- Parser 1: For Standard Tables (Jazz/Zong/etc) ---------------------- */
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

    if (rowIndex === 0) { rowIndex++; continue; }

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
  
  // 1. Extract Mobile (MSISDN)
  let mobile = null;
  const msisdnMatch = html.match(/MSISDN\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
  if (msisdnMatch) mobile = msisdnMatch[1];

  // 2. Extract Name & Address (capture text inside black borders)
  // We get all lines with border-bottom, excluding the empty dots
  const textBlocks = html.match(/border-bottom:2px solid black;">([^<]+)/g);
  
  let name = null;
  let address = null;
  let cnic = null;

  if (textBlocks && textBlocks.length > 0) {
    // Clean the matches to get actual text
    const cleanTexts = textBlocks.map(t => t.replace(/.*>/, '').trim()).filter(t => t.length > 2 && t !== '.');

    // Usually, Name is the first meaningful text, Address is the second
    if (cleanTexts.length >= 1) name = cleanTexts[0];
    if (cleanTexts.length >= 2) address = cleanTexts[1];
  }

  // 3. Extract CNIC explicitly
  const cnicMatch = html.match(/CNIC No\.\s*<\/td>\s*<td[^>]*>\s*([\d]+)/i);
  if (cnicMatch) cnic = cnicMatch[1];

  // 4. If Name is still missing, try the specific 'deducted/collected from' layout
  if (!name) {
    const nameMatch = html.match(/on account of income tax has been\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);
    if (nameMatch) name = nameMatch[1].trim();
  }
  
  // 5. If Address is still missing, try the 'deducted/collected from' second line
  if (!address) {
    const addrMatch = html.match(/deducted\/collected from\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);
    if (addrMatch) address = addrMatch[1].trim();
  }

  // Push only if we found real data
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