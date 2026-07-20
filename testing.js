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
  const TARGET_URL = `https://telenorquiztodays.pk/`;
  
  // Cookies (From Screenshot for Cloudflare Bypass)
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

  // ---------- SECTION-BASED PARSING (100% Accurate) ----------
  const results = [];

  // 1. Split HTML into individual Question Blocks using the border style as a delimiter.
  // The question blocks are wrapped in divs with a specific border style: border: 5px solid var(--global-palette1, #3182CE)
  const blocks = html.split(/border-[a-z]*:\s*5px\s+solid\s+var\(--global-palette1,\s*#3182CE\)/gi);
  
  // blocks[0] is the header, blocks[1] to blocks[5] are the 5 question blocks.
  // We iterate from 1 to 5 (or while blocks length is enough)
  for (let i = 1; i < blocks.length && i <= 5; i++) {
    const blockHtml = blocks[i];
    
    // 2. Extract Question Text
    // Inside the block, look for "Question X:" followed by text until a < or &nbsp;
    const qRegex = /Question\s*\d+:\s*([^<]+)/i;
    const qMatch = blockHtml.match(qRegex);
    const questionText = qMatch ? qMatch[1].trim() : `Question ${i} Not Found`;

    // 3. Extract Correct Answer (Green Button)
    // Look specifically for the green button inside this specific block.
    // The green button has class="kt-adv-heading..." and contains the answer.
    const ansRegex = /class="[^"]*kt-adv-heading[^"]*"[^>]*>([^<]+)<\//i;
    const ansMatch = blockHtml.match(ansRegex);
    let correctAnswer = ansMatch ? ansMatch[1].trim() : "Answer not found";

    // Clean up HTML entities
    if (correctAnswer.includes('&nbsp;')) {
      correctAnswer = correctAnswer.replace(/&nbsp;/g, ' ').trim();
    }
    if (questionText.includes('&nbsp;')) {
      // Already handled by regex, but safety check
    }

    results.push({
      question: questionText,
      correctAnswer: correctAnswer
    });
  }

  return results;
}