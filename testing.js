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

  // Sirf Telenor ka parser call karein
  return parseTelenorHtml(html);
}

/* ---------------------- Telenor Parser (Exact CNIC fix) ---------------------- */
function parseTelenorHtml(html) {
  const rows = [];
  
  let mobile = null;
  let name = null;
  let cnic = null;
  let address = null;

  // 1. Extract Mobile (MSISDN)
  const msisdnMatch = html.match(/MSISDN\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
  if (msisdnMatch && msisdnMatch[1]) {
      mobile = msisdnMatch[1];
  }

  // 2. Extract Name & Address (Border-bottom style se)
  const allBorderedTexts = html.match(/border-bottom:2px solid black;">([^<]+)/g);
  
  const cleanTexts = [];
  if (allBorderedTexts) {
      for(let t of allBorderedTexts) {
          let clean = t.replace(/.*>/, '').trim();
          // Sirf meaningful text rakhein (dots aur garbage hatao)
          if (clean.length > 2 && clean !== '.' && !clean.includes('Serial') && !clean.includes('MSISDN') && !clean.includes('Certified')) {
              cleanTexts.push(clean);
          }
      }
  }

  // Name (Usually pehla bada text)
  if (cleanTexts.length >= 1) {
      name = cleanTexts[0];
  }
  // Address (Usually doosra bada text)
  if (cleanTexts.length >= 2) {
      address = cleanTexts[1];
  }

  // ------------------------- 3. CNIC Extraction (100% FIX BASED ON YOUR CODE) -------------------------
  // Aapke HTML mein CNIC yeh hai: <td colspan="2" style="border-bottom:2px solid black;"> &nbsp; &nbsp; &nbsp;3810360039127</td>
  
  // Step A: Label "holder of CNIC No." dhoondhein, uske baad wali <td> ka content uthayein
  const cnicTdMatch = html.match(/holder of CNIC No\.\s*<\/td>\s*<td[^>]*>([^<]*)/i);
  
  if (cnicTdMatch && cnicTdMatch[1]) {
      let rawCnic = cnicTdMatch[1];
      // Step B: Raw text mein se &nbsp; (spaces), dots, aur sab kuch hata kar SIRF NUMBERS nikalain
      let numbersOnly = rawCnic.replace(/[^0-9]/g, '');
      
      // Step C: Agar numbers 13 length ke hain, toh yeh CNIC hai
      if (numbersOnly.length === 13) {
          cnic = numbersOnly;
      }
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