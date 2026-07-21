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

  const results = [];

  // ---- FIX: Pure Regex Approach (No DOMParser) ----
  
  // 1. HTML ko Question blocks mein todna.
  // Regex: "Question X:" se start karo, aur "Question Y:" (next) ya "Video Guide" tak khatam karo.
  const blocks = html.match(/Question \d+?:[\s\S]*?(?=(Question \d+?:|Video Guide|$))/gi);

  if (!blocks) {
    return results;
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    
    // 2. Question text nikaalna (HTML tags hata kar)
    let question = block.replace(/<[^>]*>/g, ' ') // Tags hatao
                        .replace(/\s+/g, ' ')     // Extra spaces hatao
                        .trim();
    // Sirf first line (Question) rukne ke liye
    question = question.split('\n')[0].trim();

    // 3. CORRECT ANSWER extract karna (Green Button)
    let correctAnswer = "Answer not found";
    
    // Important: Green button ke andar <strong>Text</strong> hota hai.
    // Hum regex mein "kt-adv-heading" class dhoondhenge aur uske andar ka <strong> text uthayenge.
    // Pattern: class="...kt-adv-heading..." ke baad kuch bhi, phir <strong>TEXT</strong>
    const answerMatch = block.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i);
    
    if (answerMatch && answerMatch[1]) {
      correctAnswer = answerMatch[1].trim();
    } 
    // Fallback: Agar <strong> ke bina ho to direct text le lo
    else {
      const fallbackMatch = block.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*>([^<]+)<\//i);
      if (fallbackMatch && fallbackMatch[1]) {
        let ans = fallbackMatch[1].trim();
        if (ans !== "Answer" && ans.length > 2) {
          correctAnswer = ans;
        }
      }
    }

    // HTML entities clean karna (e.g., &nbsp; and &#8220;)
    correctAnswer = correctAnswer.replace(/&nbsp;/g, ' ').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"');

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}