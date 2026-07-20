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

  // 1. HTML ko Sirf 5 Question Blocks mein todna using 'Question X:'
  const questionLabels = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];
  
  for (let i = 0; i < questionLabels.length; i++) {
    const currentLabel = questionLabels[i];
    const nextLabel = i < questionLabels.length - 1 ? questionLabels[i + 1] : null;
    
    let startIndex = html.indexOf(currentLabel);
    let endIndex = nextLabel ? html.indexOf(nextLabel, startIndex + 1) : html.length;
    
    if (startIndex === -1) continue;
    
    let blockHtml = html.substring(startIndex, endIndex);

    // 2. Extract Clean Question (Remove Options)
    let question = `Question ${i+1}:`;
    let questionTextMatch = blockHtml.match(/Question\s*\d+:\s*([^<]+)/);
    if (questionTextMatch && questionTextMatch[1]) {
        question = "Question " + (i+1) + ": " + questionTextMatch[1].trim();
    }

    // 3. Extract Correct Answer (FIX: Target Green Button and its immediate text)
    let correctAnswer = "Answer not found";
    
    // Tareeqa: Green button (background-color: #24ff2a) ke baad ka text uthana.
    // Q1/Q2 answers were inside the button, Q3/Q4/Q5 answers are RIGHT NEXT to the green label.
    
    // Match pattern: Green button class ko dhoondho, phir text extract karo jo style ke baad aata hai.
    const greenBtnMatch = blockHtml.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*style="[^"]*background(?:-color)?:\s*#24ff2a[^"]*"[^>]*>[\s\S]*?>(.*?)<\//i);
    
    if (greenBtnMatch && greenBtnMatch[1]) {
        let ans = greenBtnMatch[1].trim();
        // Agar text "Answer" ya "<strong>Answer" hai, toh reject karo
        if(ans.includes('Answer') === false) {
            correctAnswer = ans;
        } else {
            // Agar mila "<strong>Answer", toh hum Green button ke 'next sibling' ki text uthayenge.
            // Isko simple tarike se karne ke liye hum agle paragraph ko uthayenge.
            const afterGreenBtnMatch = blockHtml.match(/<p[^>]*>\s*<strong>([^<]+)<\/strong>\s*<\/p>/g);
            if (afterGreenBtnMatch) {
                // Regex se pehla strong text nikaalo
                const finalMatch = afterGreenBtnMatch[afterGreenBtnMatch.length-1].match(/<strong>([^<]+)<\/strong>/);
                if (finalMatch) correctAnswer = finalMatch[1].trim();
            }
        }
    }
    
    // Agar strong tag ke bina ho to (Q1,Q2 style)
    if (correctAnswer === "Answer not found") {
        const directMatch = blockHtml.match(/<p[^>]*class="[^"]*kt-adv-heading[^"]*"[^>]*>([^<]+)<\/p>/i);
        if (directMatch && directMatch[1] && directMatch[1].toLowerCase() !== 'answer') {
            correctAnswer = directMatch[1].trim();
        }
    }

    // 4. Clean up HTML entities (Remove quotes and tags)
    question = question.replace(/<[^>]*>|&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
    correctAnswer = correctAnswer.replace(/<[^>]*>|&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}