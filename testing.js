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
        error: "Scraping failed.",
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
  // Homepage par request bhejein
  const TARGET_URL = `https://telenorquiztodays.pk/`;
  
  // Cookies (From Screenshot)
  const cookies = [
    "_ga=GA1.1.2137942815.1784559948;",
    "_ga_5FRVYN66BF=GS2.1.1784559947.1.0.1784559956.0.0.0;",
    "__cf_bm=3ScbNnhJ7vXX6s43hXn5Xg9eS2.D8zKUVmJHeiWbwfw-1784559948-1.0.1.1-n9FvZRlV43PkbURqSvoYjnnqSpxLLfK5w9k3Kkf00Kpdrz7Lq7lDl3Vj2oy3sNrzK8GdR5ccvB5mD3HdUt_tvWySBQ2AS7sSC7C4UYk0;"
  ].join(' ');

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Cookie": cookies
  };

  const response = await fetch(TARGET_URL, { headers });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch page. Status: ${response.status}`);
  }

  const html = await response.text();

  // ---------- FIXED PARSING LOGIC ----------
  const results = [];

  // Loop 5 times for 5 questions
  for (let i = 1; i <= 5; i++) {
    
    // 1. Extract Question Text
    // Search for "Question i:" followed by text until a newline or < symbol
    const qRegex = new RegExp(`Question\\s*${i}:\\s*([^<]+)`, 'i');
    const qMatch = html.match(qRegex);
    const questionText = qMatch ? qMatch[1].trim() : `Question ${i} Not Found`;

    // 2. Extract Correct Answer (Green Button)
    // The correct answer is always inside a div with background-color: #24ff2a
    // We find the Answer for the current question by looking at the answer blocks sequentially
    // or by grabbing all green blocks and picking the one matching the question index.
    
    // To be safe, we find ALL green answer blocks in the entire HTML
    const greenBlocks = html.match(/background-color:\s*#24ff2a[^>]*>([^<]+)<\//gi);
    
    let correctAnswer = "Answer not found";
    
    if (greenBlocks && greenBlocks.length >= i) {
      // Clean the specific block for Question 'i'
      correctAnswer = greenBlocks[i-1]
        .replace(/background-color:\s*#24ff2a[^>]*>/, '') // Remove the style part
        .replace(/<\/?[^>]+(>|$)/g, "")                  // Remove any leftover tags
        .trim();
    }

    // Clean up answer string
    if (correctAnswer.includes('&nbsp;')) {
      correctAnswer = correctAnswer.replace(/&nbsp;/g, ' ').trim();
    }

    results.push({
      question: questionText,
      correctAnswer: correctAnswer
    });
  }

  return results;
}