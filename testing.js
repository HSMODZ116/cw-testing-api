export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      // Input lein (GET ya POST se)
      const phone = url.searchParams.get("phone") || 
                    (request.method === "POST" ? (await request.json()).phone : null);

      if (!phone) {
        return jsonResponse({ error: "Phone number required (e.g., /?phone=03001234567)" }, 400);
      }

      // Target site ko hit karein
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

  // 🔥 YAHAN DECODED PAYLOAD HAI (Encryption ki zaroorat nahi!)
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

  // HTML Table parse karein (aapka purana parser theek hai)
  return parseTableHtml(html);
}

/* ---------------------- HTML Parser ---------------------- */
function parseTableHtml(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html))) {
    const rowHtml = match[1];
    const cols = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );

    if (cols.length >= 5) { // 5 columns: Mobile, Name, CNIC, Address, Status
      rows.push({
        Mobile: cols[0] || null,
        Name: cols[1] || null,
        CNIC: cols[2] || null,
        Address: cols[3] || null,
        Status: cols[4] || null,
        Brand: cols[5] || null, // Optional
        Country: "Pakistan"
      });
    }
  }
  return rows;
}