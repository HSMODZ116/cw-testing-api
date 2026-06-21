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

/* ---------------------- Zong Parser (100% Verified against HTML) ---------------------- */
function parseZongHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  // 1. Mobile Number
  // Label MOBILE# ke baad jo bhi number ho
  const mobileMatch = html.match(/MOBILE#:\s*([0-9]+)/i);
  if (mobileMatch && mobileMatch[1]) {
      mobile = mobileMatch[1];
  }

  // 2. Name (Naveeda Khanam)
  // Zong ke HTML mein Name "Original/Duplicate Date of issue..." ke just neeche hai. 
  // Isko dhoondhne ke liye hum "Date of issue" ke baad ka text utha kar clean karenge.
  const nameMatch = html.match(/Date of issue\.\s*([0-9]{2}\s[A-Za-z]+\s[0-9]{4})\s*<br>\s*([A-Za-z\s.]+)/i);
  if (nameMatch && nameMatch[2]) {
      name = nameMatch[2].trim();
  }
  
  // Fallback: Agar upar wala fail ho, toh seedha "PART VII" ke baad wala text uthao
  if (!name) {
      const fallbackName = html.match(/PART VII[^<]*<br>\s*([A-Za-z\s.]+)/i);
      if (fallbackName && fallbackName[1]) {
          name = fallbackName[1].trim();
      }
  }

  // 3. CNIC
  // Left column mein "holder of CNIC no." likha hai, uski value Right column (second <td>) mein hai
  // Hum label dhoondhenge aur uske baad wala number uthayenge.
  const cnicMatch = html.match(/holder of CNIC no\.\s*<\/td>\s*<td[^>]*>\s*([0-9]+)/i);
  if (cnicMatch && cnicMatch[1]) {
      cnic = cnicMatch[1];
  }

  // 4. Address
  // Zong ke HTML mein Address clear nahi hai, lekin "collected/deducted from" ke baad wali line address hoti hai
  const addressMatch = html.match(/collected\/deducted from\s*([^<]+)/i);
  if (addressMatch && addressMatch[1]) {
      address = addressMatch[1].trim();
  }

  // Final Push
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