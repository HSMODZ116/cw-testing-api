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

  // 1. HTML ko 5 Question Blocks mein todna using 'Question X:' delimiters
  // Is baar start aur end boundaries ko strict kar diya hai.
  const questionLabels = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];
  
  for (let i = 0; i < questionLabels.length; i++) {
    const currentLabel = questionLabels[i];
    const nextLabel = i < questionLabels.length - 1 ? questionLabels[i + 1] : null;
    
    let startIndex = html.indexOf(currentLabel);
    let endIndex = nextLabel ? html.indexOf(nextLabel, startIndex + 1) : html.length;
    
    if (startIndex === -1) continue;
    
    let blockHtml = html.substring(startIndex, endIndex);

    // 2. Extract Question (Clean text from the start until we hit options)
    // Ye regex "Question X:" se start karega aur uske baad jo text hai wo le lega
    // jab tak ki koi HTML tag na aa jaye.
    let question = `Question ${i+1}:`;
    let questionTextMatch = blockHtml.match(/Question\s*\d+:\s*([^<]+)/);
    if (questionTextMatch && questionTextMatch[1]) {
        question = "Question " + (i+1) + ": " + questionTextMatch[1].trim();
    }

    // 3. Extract Correct Answer (Green Button ka text)
    // Hum Regex use karenge specific classes dhoondhne ke bajaye.
    // Green Button ka answer HTML mein is tarah hota hai: <p class="..."> <strong>ANSWER</strong> </p>
    // Hum block mein search karenge <p class="kt-adv..."> <strong>...</strong>
    let correctAnswer = "Answer not found";
    
    // Simplified Matching: Class containing kt-adv-heading, then find <strong> tag inside it.
    // We also add a restriction: The text inside <strong> must NOT be exactly "Answer"
    const simpleAnswerMatch = blockHtml.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i);
    
    if (simpleAnswerMatch && simpleAnswerMatch[1]) {
        let ans = simpleAnswerMatch[1].trim();
        if(ans.toLowerCase() !== 'answer' && ans.length > 0 && ans.length < 100) {
            correctAnswer = ans;
        }
    }

    // 4. Clean up HTML entities
    question = question.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').trim();
    correctAnswer = correctAnswer.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}