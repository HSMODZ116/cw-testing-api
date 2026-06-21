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

  // Sirf Ufone ka parser call karein
  return parseUfoneHtml(html);
}

/* ---------------------- Ufone Parser (Clean & Direct Label Based) ---------------------- */
function parseUfoneHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  // 1. Extract Mobile (NUMBER: ke baad)
  // Regex: "NUMBER:" ke baad, space ya br ke baad wale digits
  const mobileMatch = html.match(/NUMBER:\s*(\d+)/i);
  if (mobileMatch && mobileMatch[1]) {
      mobile = mobileMatch[1];
  }

  // 2. Extract Name (NAME: ke baad)
  const nameMatch = html.match(/NAME:\s*([^<]+)/i);
  if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
  }

  // 3. Extract CNIC (CNIC: ke baad)
  const cnicMatch = html.match(/CNIC:\s*(\d+)/i);
  if (cnicMatch && cnicMatch[1]) {
      cnic = cnicMatch[1];
  }

  // 4. Extract Address (ADDRESS: ke baad)
  // Address multiline ho sakta hai, isliye <br> tak ya end tak dhoondhein
  const addressMatch = html.match(/ADDRESS:\s*([^<]+)/i);
  if (addressMatch && addressMatch[1]) {
      address = addressMatch[1].trim();
  }

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