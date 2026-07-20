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

  // 1. Split into Question Blocks safely
  const questionLabels = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];
  
  for (let i = 0; i < questionLabels.length; i++) {
    const currentLabel = questionLabels[i];
    const nextLabel = i < questionLabels.length - 1 ? questionLabels[i + 1] : null;
    
    let startIndex = html.indexOf(currentLabel);
    let endIndex = nextLabel ? html.indexOf(nextLabel, startIndex + 1) : html.length;
    
    if (startIndex === -1) continue;
    
    let blockHtml = html.substring(startIndex, endIndex);

    // 2. Extract Clean Question
    let question = `Question ${i+1}:`;
    let qMatch = blockHtml.match(/Question\s*\d+:\s*([^<]+)/i);
    if (qMatch && qMatch[1]) {
        question = "Question " + (i+1) + ": " + qMatch[1].trim();
    }

    // 3. THE ULTIMATE FIX (Slice and Extract)
    let correctAnswer = "Answer not found";

    // Step A: Find the Green Button (style contains #24ff2a) ka exact start index
    const greenStyleIndex = blockHtml.indexOf('background:#24ff2a');
    if (greenStyleIndex !== -1) {
        // Step B: Pehle uss Green button ke pura HTML block ko dhoondho (class="kt-adv-heading" se lekar > tak)
        // Class ka start dhoondho jo green style se pehle aata hai
        const classStartIndex = blockHtml.lastIndexOf('class="', greenStyleIndex);
        if (classStartIndex !== -1) {
            // Uss class ka end index dhoondho (Tag close karta hai >)
            const tagEndIndex = blockHtml.indexOf('>', classStartIndex);
            if (tagEndIndex !== -1) {
                
                // Step C: Tag ke andar ka text extract karo (> ke baad aur < se pehle)
                const textStart = tagEndIndex + 1;
                const textEnd = blockHtml.indexOf('<', textStart);
                
                if (textStart !== -1 && textEnd !== -1) {
                    // Step D: Raw Text nikalo
                    let extracted = blockHtml.substring(textStart, textEnd).trim();
                    
                    // Step E: Clean karo HTML entities aur tags
                    extracted = extracted.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
                    
                    // Step F: FILTER OUT THE "Answer" LABEL
                    // Agar extracted text "Answer" hai, toh reject kar do. 
                    // Jo bachega, woh Correct Answer hoga.
                    if (extracted.toLowerCase() !== 'answer' && extracted.length > 0 && extracted.length < 200) {
                        correctAnswer = extracted;
                    }
                }
            }
        }
    }

    // 4. Final Cleanup (Remove extra spaces)
    question = question.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
    correctAnswer = correctAnswer.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}