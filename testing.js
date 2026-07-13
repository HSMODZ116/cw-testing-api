export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone number required. Use ?phone=03xxxxxxxxx' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      // **⚠️ ZAROORI: Aapki current active cookies yahan paste karein (Image 4 se)** 
      // Agar purani cookie kaam nahi kar rahi, toh mobile se login karke nayi cookie copy karein.
      const myCookies = '_ga=GA1.1.906072907.1783902489; PHPSESSID=biudfic7422bc6d8fpgremeu0ih; _ga_V41WE16KKG=GS1.1.1783902488%7Cs1g1%7C...';

      const targetUrl = 'https://paksim.xyz/pig-search.php';
      
      const formData = new URLSearchParams();
      formData.append('q', phone);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8', // HTML accept kar rahe hain
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://paksim.xyz',
          'Referer': 'https://paksim.xyz/',
          'Cookie': myCookies
        },
        body: formData.toString()
      });

      // Pehle try karte hain agar JSON hai
      const textData = await response.text();

      // Agar JSON hai toh seedha return
      try {
        const jsonData = JSON.parse(textData);
        return new Response(JSON.stringify(jsonData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        // Agar JSON parse fail hua (matlab HTML aaya), toh HTML se data scrape karo
        console.log("JSON parse failed. Scraping HTML...");
        
        // Simple Regex se data nikal rahe hain (Image 2 ke text ke hisaab se)
        const nameMatch = textData.match(/NAME[\s\S]*?([A-Za-z\s.]+)/);
        const cnicMatch = textData.match(/CNIC[\s\S]*?([0-9]+)/);
        const addressMatch = textData.match(/ADDRESS[\s\S]*?([A-Za-z0-9\s.,]+)/);

        const scrapedData = {
          ok: true,
          data: [{
            nbr: phone,
            nam: nameMatch ? nameMatch[1].trim() : "Not Found",
            cni: cnicMatch ? cnicMatch[1].trim() : "Not Found",
            adr: addressMatch ? addressMatch[1].trim() : "Not Found"
          }]
        };

        return new Response(JSON.stringify(scrapedData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch data', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};