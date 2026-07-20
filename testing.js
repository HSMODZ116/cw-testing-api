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

  // ---------- ACCURATE BLOCK-SPLITTING + SMART ANSWER EXTRACTION ----------
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
    const questionText = qMatch ? qMatch[1].trim() : `Question ${i+1} Not Found`;

    // 2. Extract Correct Answer (Smart Green Box Logic)
    // Look for the green box style 'background-color: #24ff2a' and extract the text immediately following it.
    // This handles answers both WITH and WITHOUT <strong> tags.
    let correctAnswer = "Answer not found";
    
    // Use a general regex that captures everything inside the green box until a closing tag is found
    const greenBoxRegex = /background-color:\s*#24ff2a[^>]*>([^<]+)(?:<\/[^>]+>)?/i;
    const ansMatch = blockHtml.match(greenBoxRegex);
    
    if (ansMatch && ansMatch[1]) {
      let rawAnswer = ansMatch[1].trim();
      // Remove the "Answer" label if it accidentally got captured
      if (rawAnswer === "Answer" || rawAnswer === "Answer ") {
        // If the first match was just "Answer", try capturing the next text element in the block
        const fallbackRegex = /background-color:\s*#24ff2a[^>]*>.*?>(.*?)<\//i;
        const fallbackMatch = blockHtml.match(fallbackRegex);
        if (fallbackMatch && fallbackMatch[1]) {
          rawAnswer = fallbackMatch[1].trim();
        }
      }
      // Clean up HTML entities
      rawAnswer = rawAnswer.replace(/&nbsp;/g, ' ').trim();
      
      // Only accept if it's valid text (not too long, not CSS)
      if (rawAnswer.length > 0 && rawAnswer.length < 200) {
        correctAnswer = rawAnswer;
      }
    }

    results.push({
      question: questionText,
      correctAnswer: correctAnswer
    });
  }

  return results;
}