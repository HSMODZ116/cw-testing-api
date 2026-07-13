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
      // APNI FRESH COOKIE YAHAN PASTE KAREIN
      const myCookies = '_ga=GA1.1.906072907.1783902489; PHPSESSID=biudfic7422bc6d8fpgremeu0ih; _ga_V41WE16KKG=GS1.1.1783902488%7Cs1g1%7C...';

      const targetUrl = 'https://paksim.xyz/pig-search.php';
      
      const formData = new URLSearchParams();
      formData.append('q', phone);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://paksim.xyz',
          'Referer': 'https://paksim.xyz/',
          'Cookie': myCookies
        },
        body: formData.toString()
      });

      const text = await response.text();

      // 1. Pehle check karo agar JSON hai toh seedha return kar do
      try {
        const jsonData = JSON.parse(text);
        return new Response(JSON.stringify(jsonData), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (_) {
        // 2. Agar JSON nahi hai toh HTMLRewriter se data nikaalo
        let scrapedData = { ok: true, data: [{ nbr: phone, nam: "Not Found", cni: "Not Found", adr: "Not Found" }] };
        
        let currentKey = '';
        let foundData = {};

        const rewriter = new HTMLRewriter()
          .on('div[class*="record"]', { // "record" wale div ko dhoondhega (Jaise aapki image mein hai)
            element(element) {
              // Bas ye confirm kar rahe hain ki element mila
            }
          })
          .on('div:matches(NAME|CNIC|ADDRESS)', { // NAME, CNIC, ADDRESS likha hua div dhoondhega
            text(text) {
              const clean = text.text.trim();
              if(clean === 'NAME') currentKey = 'nam';
              else if(clean === 'CNIC') currentKey = 'cni';
              else if(clean === 'ADDRESS') currentKey = 'adr';
            }
          })
          .on('div:matches(NAME|CNIC|ADDRESS) + div', { // Label ke agle div mein value hogi
            text(text) {
              if (currentKey && text.text.trim()) {
                foundData[currentKey] = text.text.trim();
                currentKey = ''; // Reset kar do
              }
            }
          });

        await rewriter.transform(new Response(text)).text();

        // Agar humein data mil gaya, toh update kar do
        if (foundData.nam) {
          scrapedData.data[0] = { ...scrapedData.data[0], ...foundData };
        }

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