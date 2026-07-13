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
      // ** 1. APNI EXACT COOKIES YAHAN PASTE KAREIN (Image 6 se copy karein) **
      const myCookies = '_ga=GA1.1.906072907.1783902489; PHPSESSID=biudfic7422bc6d8fpgremeu0ih; _ga_V41WE16KKG=GS1.1.1783902488%7Cs1g1%7C117...'; 

      const targetUrl = 'https://paksim.xyz/pig-search.php';
      
      const formData = new URLSearchParams();
      formData.append('q', phone);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
          
          // ** 2. SABSE ZAROORI FIX: Accept header ko JSON set kiya **
          'Accept': 'application/json, text/javascript, */*; q=0.01', 
          
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://paksim.xyz',
          'Referer': 'https://paksim.xyz/',
          'Cookie': myCookies
        },
        body: formData.toString()
      });

      // Ab hum seedha JSON parse karenge (HTML parse nahi)
      const data = await response.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      // Agar error aata hai toh usko batayen
      return new Response(JSON.stringify({ 
        error: 'API call failed. Most likely your Cookie (PHPSESSID) has expired.', 
        details: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};