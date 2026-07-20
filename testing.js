export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    let query = url.searchParams.get('query') || url.searchParams.get('q');

    if (!query && request.method === 'POST') {
      try {
        const text = await request.text();
        const params = new URLSearchParams(text);
        query = params.get('query') || params.get('q');
      } catch (e) {}
    }

    // Default to today's date if no query is provided
    const dateSlug = query || 'today'; 

    try {
      const answers = await scrapeTelenorQuiz(dateSlug);
      
      if (!answers || answers.length === 0) {
        return jsonResponse({
          success: true,
          searchedDate: dateSlug,
          answers: "No Record Found",
          developer: "Haseeb Sahil"
        });
      }

      return jsonResponse({
        success: true,
        searchedDate: dateSlug,
        totalQuestions: answers.length,
        answers: answers,
        developer: "Haseeb Sahil"
      });

    } catch (error) {
      return jsonResponse({
        success: false,
        error: "Scraping failed. Check date format or target site.",
        details: error.message
      }, 500);
    }
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function scrapeTelenorQuiz(dateQuery) {
  const TARGET_URL = `https://telenorquiztodays.pk/`;
  
  // ✅ EXACT COOKIES FROM YOUR SCREENSHOT (Cloudflare Bypass)
  const cookies = [
    "_ga=GA1.1.2137942815.1784559948;",
    "_ga_5FRVYN66BF=GS2.1.1784559947.1.0.1784559956.0.0.0;",
    "__cf_bm=3ScbNnhJ7vXX6s43hXn5Xg9eS2.D8zKUVmJHeiWbwfw-1784559948-1.0.1.1-n9FvZRlV43PkbURqSvoYjnnqSpxLLfK5w9k3Kkf00Kpdrz7Lq7lDl3Vj2oy3sNrzK8GdR5ccvB5mD3HdUt_tvWySBQ2AS7sSC7C4UYk0;",
    "FCCDCF=%5B%7B%22c%22%3A2%2C%22v%22%3A%22v2%22%2C%22s%22%3A%22%22%7D%5D;",
    "FCNEC=%5B%5B%22AKsKormKa1sAs%22%5D%5D;"
  ].join(' ');

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cookie": cookies
  };

  const response = await fetch(TARGET_URL, { headers });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch page. Status: ${response.status}`);
  }

  const html = await response.text();

  // ---------- PARSING LOGIC ----------
  const results = [];

  // 1. Split the HTML into Question segments using "Question X:" as delimiter
  const sections = html.split(/(Question\s*\d+:\s*)/gi);
  
  // sections[0] is header, sections[1] is "Question 1:", sections[2] is content of Q1, etc.
  for (let i = 1; i < sections.length; i += 2) {
    const qHeader = sections[i];
    const qContent = sections[i+1] || "";

    // Extract Question Text
    const questionMatch = qHeader.match(/Question\s*\d+:\s*([^<]+)/i);
    const questionText = questionMatch ? questionMatch[1].trim() : "Unknown Question";

    // Look for the Green Answer button within this specific qContent
    let correctAnswer = "Answer not found in this block";
    
    // Strategy 1: Look for the green background color style
    const greenMatch = qContent.match(/background-color:\s*#24ff2a[^>]*>([^<]+)<\//i);
    if (greenMatch) {
      correctAnswer = greenMatch[1].trim();
    } else {
      // Strategy 2: Look for the Answer label and adjacent green styled text
      const answerMatch = qContent.match(/Answer\s*<\/div>\s*<div[^>]*style[^>]*#24ff2a[^>]*>([^<]+)<\//i);
      if (answerMatch) {
        correctAnswer = answerMatch[1].trim();
      } else {
        // Strategy 3: Look for class with green background
        const classMatch = qContent.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*>([^<]+)<\//i);
        if (classMatch) {
          correctAnswer = classMatch[1].trim();
        }
      }
    }

    // Clean up the answer string
    if (correctAnswer.includes('&nbsp;')) {
      correctAnswer = correctAnswer.replace(/&nbsp;/g, ' ').trim();
    }

    results.push({
      question: questionText,
      correctAnswer: correctAnswer
    });
  }

  // Limit to 5 questions if more are captured
  return results.slice(0, 5);
}