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
  
  // Cookies (Cloudflare Bypass)
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

  // ---------- ACCURATE SPLITTING & GREEN BOX EXTRACTION ----------
  const results = [];
  const questionLabels = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];
  
  for (let i = 0; i < questionLabels.length; i++) {
    const currentLabel = questionLabels[i];
    const nextLabel = i < questionLabels.length - 1 ? questionLabels[i + 1] : null;
    
    let startIndex = html.indexOf(currentLabel);
    let endIndex = nextLabel ? html.indexOf(nextLabel, startIndex + 1) : html.length;
    
    if (startIndex === -1) continue;
    
    const blockHtml = html.substring(startIndex, endIndex);
    
    // 1. Extract Question Text
    const qRegex = /Question\s*\d+:\s*([^<]+)/i;
    const qMatch = blockHtml.match(qRegex);
    const questionText = qMatch ? qMatch[1].trim().replace(/&#8220;/g, '"').replace(/&#8221;/g, '"') : `Question ${i+1} Not Found`;

    // 2. Extract Correct Answer (Class-Based Extraction)
    // HTML mein green button class="kt-adv-heading..." ke andar hai
    let correctAnswer = "Answer not found";
    
    // Saare green boxes dhoondhein aur current block ke hisaab se match karein
    const greenRegex = /class="[^"]*kt-adv-heading[^"]*"[^>]*>([^<]+)<\//gi;
    let match;
    let answersFound = [];
    
    while ((match = greenRegex.exec(blockHtml)) !== null) {
      let ans = match[1].trim();
      // Clean up HTML entities and ignore "Answer" label
      ans = ans.replace(/&nbsp;/g, ' ').replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').trim();
      if (ans.length > 1 && ans !== "Answer") {
        answersFound.push(ans);
      }
    }

    if (answersFound.length > 0) {
      // Pehla answer jo "Answer" label nahi hai, woh correct answer hai
      correctAnswer = answersFound[0];
    }

    results.push({
      question: questionText,
      correctAnswer: correctAnswer
    });
  }

  return results;
}