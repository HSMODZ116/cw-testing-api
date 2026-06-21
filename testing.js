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

  return parseZongHtml(html);
}

/* ---------------------- Zong Parser (Table Columns & Labels) ---------------------- */
function parseZongHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  // 1. Extract Mobile (MOBILE# ke baad wali line)
  // Label: MOBILE#: 3150954290
  const mobileMatch = html.match(/MOBILE#:\s*(\d+)/i);
  if (mobileMatch && mobileMatch[1]) {
      mobile = mobileMatch[1];
  }

  // 2. Extract Name (Right column mein specific line pe)
  // HTML mein "Naveeda Khanam" likha hai
  // Uske aas paas structure dhoondh rahe hain
  // "Date of issue" ke baad, ya specific line pe
  let nameLine = html.match(/Original\/Duplicate Date of issue\.\s*([^<]+)/i);
  if (nameLine && nameLine[1]) {
      // Line ko split karein aur pehla valid word uthayein
      let parts = nameLine[1].trim().split(/\s+/);
      // Agar last part year (2024) hai toh usko hata kar name dhoondhein
      // Zong ke layout mein name last line ke upar hota hai
      let tempName = html.match(/>\s*([A-Za-z]+\s+[A-Za-z]+)\s*<\/td>/g);
      if(tempName) {
          // Clean karein
          name = tempName[tempName.length-1].replace(/[<>]/g, '').trim();
      }
  }

  // Agar name nahi mila, alternate method dhoondhein
  if(!name) {
      const altNameMatch = html.match(/td[^>]*>\s*([A-Za-z]+\s+[A-Za-z]+)\s*<\/td>\s*<td/i);
      if(altNameMatch && altNameMatch[1]) {
          name = altNameMatch[1].trim();
      }
  }

  // 3. Extract CNIC (Right column mein, label ke samne)
  // Label: holder of CNIC no.
  // Value same row ke right side mein: 1730129916146
  const cnicMatch = html.match(/holder of CNIC no\.\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
  if (cnicMatch && cnicMatch[1]) {
      cnic = cnicMatch[1];
  }

  // 4. Extract Address
  // Zong layout mein Address clear nahi hai, "Collected/deducted from" ke baad wali line
  const addressMatch = html.match(/collected\/deducted from\s*([^<]+)/i);
  if (addressMatch && addressMatch[1]) {
      address = addressMatch[1].trim();
  }

  // Agar address nahi mila, toh default null rakhain
  if(!address) address = null;

  // Final Result Push
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