export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Root path logic
    if (url.pathname === "/") {
      return new Response(JSON.stringify({
        message: "Welcome to Number Info API",
        usage: "/info?number=PHONE_NUMBER"
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // /info path logic
    if (url.pathname === "/info") {
      const phone_number = url.searchParams.get("number");

      if (!phone_number) {
        return new Response(JSON.stringify({ error: "Please provide ?number= parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Validation logic
      const isValid = /^\+?\d+$/.test(phone_number);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid phone number format" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      try {
        const targetUrl = "https://calltracer.in";
        const body = new URLSearchParams();
        body.append("country", "PK");
        body.append("q", phone_number);

        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Host": "calltracer.in",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: body.toString()
        });

        if (!response.ok) {
          return new Response(JSON.stringify({ error: `Failed to fetch data. HTTP ${response.status}` }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        const html = await response.text();

        // Function to extract table cell value using Regex
        const getValue = (label, source) => {
          // Yeh regex label ko find karke uske agle <td> ka data nikalta hai
          const regex = new RegExp(`<td>[^<]*${label}[^<]*<\/td>\\s*<td>([^<]*)<\/td>`, "i");
          const match = source.match(regex);
          return match ? match[1].trim() : "N/A";
        };

        const data = {
          "Number": phone_number,
          "Complaints": getValue("Complaints", html),
          "Owner Name": getValue("Owner Name", html),
          "SIM Card": getValue("SIM card", html),
          "Mobile State": getValue("Mobile State", html),
          "IMEI Number": getValue("IMEI number", html),
          "MAC Address": getValue("MAC address", html),
          "Connection": getValue("Connection", html),
          "IP Address": getValue("IP address", html),
          "Owner Address": getValue("Owner Address", html),
          "Hometown": getValue("Hometown", html),
          "Reference City": getValue("Refrence City", html),
          "Owner Personality": getValue("Owner Personality", html),
          "Language": getValue("Language", html),
          "Mobile Locations": getValue("Mobile Locations", html),
          "Country": getValue("Country", html),
          "Tracking History": getValue("Tracking History", html),
          "Tracker ID": getValue("Tracker Id", html),
          "Tower Locations": getValue("Tower Locations", html),
        };

        // Check if all fields are N/A
        const allNA = Object.keys(data).filter(k => k !== "Number").every(k => data[k] === "N/A");
        if (allNA) {
          return new Response(JSON.stringify({ error: "No data found for this number." }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" // CORS allow karne ke liye
          }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};