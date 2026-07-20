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
  
  // Cookies (Screenshot se)
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

  // 1. HTML ko Question blocks mein todna
  const blocks = html.match(/Question \d+?:[\s\S]*?(?=(Question \d+?:|Video Guide|$))/gi);

  if (!blocks) {
    return results;
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // 2. SIRF QUESTION extract karna (Options ko ignore karna)
    // Regex `Question X:.*?<br` tak rukna hai (ke baad options start hote hain)
    let questionMatch = block.match(/(Question \d+?:.*?)(?:<br\s*\/?>|<\/p>|<strong)/i);
    let question = questionMatch ? questionMatch[1].trim() : `Question ${i+1} Not Found`;
    
    // HTML tags aur entities clean karna (Sirf text rakhna hai)
    question = question.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').trim();

    // 3. CORRECT ANSWER extract karna (Green button ka text)
    let correctAnswer = "Answer not found";
    
    // Green Button ke background color (hex #24ff2a) ka pattern match karna
    // Class ".kt-adv-heading" aur style "background-color: #24ff2a" dhoondho
    const greenBtnMatch = block.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*style="[^"]*background(?:-color)?:\s*#24ff2a[^"]*"[^>]*>([^<]+)/i);
    
    if (greenBtnMatch && greenBtnMatch[1]) {
      let ans = greenBtnMatch[1].trim();
      
      // Agar text "Answer" hai to usko reject karo. Sirf correct answer lo.
      if (ans.toLowerCase() !== "answer" && ans.length > 0 && ans.length < 100) {
        correctAnswer = ans;
      } else {
        // Try extra extraction inside strong tags if answer extraction failed
        const strongMatch = block.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*style="[^"]*background(?:-color)?:\s*#24ff2a[^"]*"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i);
        if (strongMatch && strongMatch[1] && strongMatch[1].toLowerCase() !== "answer") {
             correctAnswer = strongMatch[1].trim();
        }
      }
    }

    // Saaf kar dena HTML entities ko
    correctAnswer = correctAnswer.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}