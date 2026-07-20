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
  // Homepage par request bhejein
  const TARGET_URL = `https://telenorquiztodays.pk/`;
  
  // ✅ EXACT COOKIES FROM YOUR SCREENSHOT (Cloudflare Bypass)
  const cookies = [
    "_ga=GA1.1.2137942815.1784559948;",
    "_ga_5FRVYN66BF=GS2.1.1784559947.1.0.1784559956.0.0.0;",
    "__cf_bm=3ScbNnhJ7vXX6s43hXn5Xg9eS2.D8zKUVmJHeiWbwfw-1784559948-1.0.1.1-n9FvZRlV43PkbURqSvoYjnnqSpxLLfK5w9k3Kkf00Kpdrz7Lq7lDl3Vj2oy3sNrzK8GdR5ccvB5mD3HdUt_tvWySBQ2AS7sSC7C4UYk0;"
  ].join(' ');

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
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

  // ---------- PARSING LOGIC (CSS Garbage Removed) ----------
  const results = [];

  // 1. Regex to find ALL "Answer" green boxes. 
  // We look for <p> tags that have class="kt-adv-heading..." and contain the green background style
  // AND we only capture text that is NOT CSS code (text length < 200 characters)
  const greenBlockRegex = /<p[^>]*class="kt-adv-heading[^"]*"[^>]*>[^<]*<strong>([^<]+)<\/strong><\/p>/g;
  
  let match;
  let answersFound = [];
  
  // Loop through all green answer blocks
  while ((match = greenBlockRegex.exec(html)) !== null) {
    let answer = match[1].trim();
    // Remove any leftover HTML entities
    answer = answer.replace(/&nbsp;/g, ' ').trim();
    // Ignore if the captured text is too long (CSS code)
    if (answer.length > 0 && answer.length < 200) {
      answersFound.push(answer);
    }
  }

  // 2. Extract ALL Question texts
  const questionRegex = /<strong>Question\s*\d+:[\s\S]*?<[^>]*>([^<]+)<\//g;
  let qMatch;
  let questionsFound = [];

  while ((qMatch = questionRegex.exec(html)) !== null) {
    let question = qMatch[1].trim();
    // Filter out "Answer" or extra bold texts
    if (question.length > 10 && !question.includes('Answer')) {
      questionsFound.push(question);
    }
  }

  // 3. Map questions to answers (First 5 matches)
  for (let i = 0; i < 5; i++) {
    results.push({
      question: questionsFound[i] || `Question ${i+1} Not Found`,
      correctAnswer: answersFound[i] || "Answer not found in this block"
    });
  }

  return results;
}