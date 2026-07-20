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

  // --- FIX: DOMParser ka use karna (Cloudflare Workers support karta hai) ---
  const document = new DOMParser().parseFromString(html, 'text/html');
  const results = [];

  // Question blocks dhoondhna (sirf wohi select karna jisme green answer button hai)
  // HTML mein 'kt-adv-heading14_b823be-d9' class sirf Answer button ke liye hai
  const questionBlocks = document.querySelectorAll('.wp-block-kadence-rowlayout .kt-row-column-wrap');

  let questionIndex = 0;

  // Har block mein check karna
  for (const block of questionBlocks) {
    // Question text dhoondhna
    const questionElement = block.querySelector('.wp-block-kadence-advancedheading');
    if (!questionElement) continue;

    let questionText = questionElement.textContent.trim();
    if (!questionText.startsWith('Question')) continue; // Skip agar Question nahi hai

    // Answer text dhoondhna (Green Button)
    // Green button wale paragraph ki class pattern: kt-adv-heading14_b823be-d9
    let correctAnswer = "Answer not found";
    
    // Tareeqa 1: Green button ka <strong> text nikaalna
    const greenBtn = block.querySelector('[class*="kt-adv-heading"][style*="background-color: #24ff2a"], [class*="kt-adv-heading"][style*="background: #24ff2a"]');
    
    if (greenBtn) {
        const strongText = greenBtn.querySelector('strong');
        if (strongText) {
            correctAnswer = strongText.textContent.trim();
        } else {
            // Agar <strong> nahi hai to direct text le lo
            correctAnswer = greenBtn.textContent.replace(/Answer/i, '').trim();
        }
    } else {
        // Tareeqa 2: Agar color style CSS mein nahi mila, to generic class dhoondho
        const possibleAnswers = block.querySelectorAll('.kt-adv-heading');
        for (const el of possibleAnswers) {
            const text = el.textContent.trim();
            // Filter karna "Answer" label ko (jo Q1 mein issue kar raha tha)
            if (text && text.length > 2 && text !== "Answer" && !text.includes("What does")) {
                correctAnswer = text;
                break;
            }
        }
    }

    results.push({
      question: questionText.replace(/&nbsp;/g, ' ').trim(),
      correctAnswer: correctAnswer.replace(/&nbsp;/g, ' ').trim()
    });
    
    questionIndex++;
    if (questionIndex >= 5) break; // Sirf 5 questions chahiye
  }

  return results;
}