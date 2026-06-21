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

  if (html.includes('NUMBER:')) {
    return parseUfoneHtml(html);
  } else if (html.includes('MOBILE#')) {
    return parseZongHtml(html);
  } else if (html.includes('MSISDN')) {
    return parseTelenorHtml(html);
  } else if (html.includes('<table')) {
    return parseTableHtml(html);
  } else {
    return [];
  }
}

function parseUfoneHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  const mobileMatch = html.match(/NUMBER:\s*(\d+)/i);
  if (mobileMatch && mobileMatch[1]) {
      mobile = mobileMatch[1];
  }

  const nameMatch = html.match(/NAME:\s*([^<]+)/i);
  if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
  }

  const cnicMatch = html.match(/CNIC:\s*(\d+)/i);
  if (cnicMatch && cnicMatch[1]) {
      cnic = cnicMatch[1];
  }

  const addressMatch = html.match(/ADDRESS:\s*([^<]+)/i);
  if (addressMatch && addressMatch[1]) {
      address = addressMatch[1].trim();
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

function parseZongHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  const mobileMatch = html.match(/MOBILE#:\s*([0-9]+)/i);
  if (mobileMatch && mobileMatch[1]) {
      mobile = mobileMatch[1];
  }

  const nameMatch = html.match(/Date of issue\.\s*[0-9]{2}\s[A-Za-z]+\s[0-9]{4}\s*<br>\s*([A-Za-z\s.]+)/i);
  if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
  }

  const cnicMatch = html.match(/holder of CNIC no\.[^>]*>\s*<\/td>\s*<td[^>]*>\s*([0-9]+)/i);
  if (cnicMatch && cnicMatch[1]) {
      cnic = cnicMatch[1];
  }
  
  if (!cnic) {
      const allNumbers = html.match(/\b\d{13}\b/g);
      if (allNumbers && allNumbers.length > 0) {
          cnic = allNumbers[0];
      }
  }

  const addressMatch = html.match(/collected\/deducted from\s*([^<]+)/i);
  if (addressMatch && addressMatch[1]) {
      address = addressMatch[1].trim();
  }

  if (mobile || name || cnic) {
    rows.push({
      Mobile: mobile || null,
      Name: name || null,
      CNIC: cnic || null,
      Address: address || null
    });
  }

  return rows;
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