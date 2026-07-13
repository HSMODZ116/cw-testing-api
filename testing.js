export default {
  async fetch(request) {
    // CORS Headers (taaki mobile app ya frontend se call kar sakein)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle Preflight (OPTIONS) request
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // URL se phone number nikalna (Example: ?phone=03068060398)
    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone number required. Use ?phone=03xxxxxxxxx' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      // API URL (aapki Image 1 se confirm)
      const targetUrl = 'https://paksim.xyz/pig-search.php';

      // ** 1. Apni Cookies yahan paste karein (Image 4 se exact copy) **
      const myCookies = '_ga=GA1.1.906072907.1783902489; PHPSESSID=biudfic7422bc6d8fpgremeu0ih; _ga_V41WE16KKG=GS1.1.1783902488%7Cs1g1%7C...';

      // ** 2. Payload (Image 1 se) **
      const formData = new URLSearchParams();
      formData.append('q', phone); // 'q' parameter use ho raha hai, 'number' nahi

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://paksim.xyz',
          'Referer': 'https://paksim.xyz/',
          'Cookie': myCookies 
        },
        body: formData.toString()
      });

      // Direct JSON response return kar rahe hain
      const data = await response.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch data', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};