// Cloudflare Worker API - Number Info Service
const CLOUDFLARE_SCRAPER_BASE_URL = "https://calltracer.in";

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
  
  // Root endpoint
  if (url.pathname === '/' || url.pathname === '') {
    return Response.json({
      message: "Welcome to Number Info API",
      usage: "/info?number=PHONE_NUMBER"
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }
  
  // Info endpoint
  if (url.pathname === '/info') {
    if (request.method !== 'GET') {
      return Response.json({ error: "Method not allowed" }, { 
        status: 405,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    const phoneNumber = url.searchParams.get('number');
    
    if (!phoneNumber) {
      return Response.json({ error: "Please provide ?number= parameter" }, { 
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    // Validate phone number format
    const phoneRegex = /^(\+\d+|\d+)$/;
    if (!phoneRegex.test(phoneNumber)) {
      return Response.json({ error: "Invalid phone number format" }, { 
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    try {
      // Prepare form data
      const formData = new URLSearchParams();
      formData.append('country', 'PK');
      formData.append('q', phoneNumber);
      
      // Send request to the target website
      const response = await fetch(CLOUDFLARE_SCRAPER_BASE_URL, {
        method: 'POST',
        headers: {
          'Host': 'calltracer.in',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': CLOUDFLARE_SCRAPER_BASE_URL,
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Cache-Control': 'max-age=0'
        },
        body: formData.toString(),
        cf: {
          // Cloudflare specific options
          cacheEverything: false,
          cacheTtl: 0
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data. HTTP ${response.status}`);
      }
      
      const html = await response.text();
      
      // Parse HTML using text parsing (since we can't use BeautifulSoup)
      const extractedData = extractDataFromHTML(html, phoneNumber);
      
      // Check if all fields are N/A (no info found)
      const values = Object.values(extractedData);
      if (values.every(v => v === "N/A")) {
        return Response.json({ error: "No data found for this number." }, { 
          status: 404,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
      
      return Response.json(extractedData, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        }
      });
      
    } catch (error) {
      return Response.json({ error: error.message }, { 
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
  
  // 404 for other routes
  return Response.json({ error: "Not found" }, { 
    status: 404,
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}

function extractDataFromHTML(html, phoneNumber) {
  // Helper function to extract value based on label
  const getValue = (label) => {
    const regex = new RegExp(`${label}[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
    const match = html.match(regex);
    
    if (match) {
      // Try to find the next td after our label
      const labelIndex = html.toLowerCase().indexOf(label.toLowerCase());
      if (labelIndex !== -1) {
        const afterLabel = html.substring(labelIndex);
        const tdMatch = afterLabel.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (tdMatch && tdMatch.length >= 2) {
          // Get the second td (which should contain our value)
          const value = tdMatch[1].replace(/<[^>]*>/g, '').trim();
          return value || "N/A";
        }
      }
    }
    
    // Alternative approach: Look for the label in table rows
    const rows = html.split('</tr>');
    for (const row of rows) {
      if (row.toLowerCase().includes(label.toLowerCase())) {
        const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (tds && tds.length >= 2) {
          const value = tds[1].replace(/<[^>]*>/g, '').trim();
          return value || "N/A";
        }
      }
    }
    
    return "N/A";
  };
  
  return {
    "Number": phoneNumber,
    "Complaints": getValue("Complaints"),
    "Owner Name": getValue("Owner Name"),
    "SIM Card": getValue("SIM card"),
    "Mobile State": getValue("Mobile State"),
    "IMEI Number": getValue("IMEI number"),
    "MAC Address": getValue("MAC address"),
    "Connection": getValue("Connection"),
    "IP Address": getValue("IP address"),
    "Owner Address": getValue("Owner Address"),
    "Hometown": getValue("Hometown"),
    "Reference City": getValue("Refrence City"),
    "Owner Personality": getValue("Owner Personality"),
    "Language": getValue("Language"),
    "Mobile Locations": getValue("Mobile Locations"),
    "Country": getValue("Country"),
    "Tracking History": getValue("Tracking History"),
    "Tracker ID": getValue("Tracker Id"),
    "Tower Locations": getValue("Tower Locations"),
  };
}

// Cloudflare Worker event listener
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});