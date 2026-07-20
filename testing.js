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

  // 1. Split into Question Blocks
  const questionLabels = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];
  
  for (let i = 0; i < questionLabels.length; i++) {
    const currentLabel = questionLabels[i];
    const nextLabel = i < questionLabels.length - 1 ? questionLabels[i + 1] : null;
    
    let startIndex = html.indexOf(currentLabel);
    let endIndex = nextLabel ? html.indexOf(nextLabel, startIndex + 1) : html.length;
    
    // Agar block mein FAQs aajaye toh cut kar do
    const faqsIndex = html.indexOf('FAQs', startIndex);
    if (faqsIndex !== -1 && faqsIndex < endIndex) {
        endIndex = faqsIndex;
    }

    if (startIndex === -1) continue;
    
    let blockHtml = html.substring(startIndex, endIndex);

    // 2. Extract Clean Question (Remove all Options)
    let question = `Question ${i+1}:`;
    let qMatch = blockHtml.match(/Question\s*\d+:\s*([^<]+)/i);
    if (qMatch && qMatch[1]) {
        question = "Question " + (i+1) + ": " + qMatch[1].trim();
    }

    // 3. EXACT GREEN BUTTON STRATEGY (3 Layers)
    let correctAnswer = "Answer not found";

    // LAYER 1: Class-based match (For Q1 and Q5 style)
    // Search for class "kt-adv-heading" followed by "Answer" label, then take the next "kt-adv-heading"
    const labelIndex = blockHtml.indexOf('class="kt-adv-heading14_4cf857-70"');
    if (labelIndex !== -1) {
        const btnIndex = blockHtml.indexOf('class="kt-adv-heading', labelIndex + 1);
        if (btnIndex !== -1) {
            const openTag = blockHtml.indexOf('>', btnIndex) + 1;
            const closeTag = blockHtml.indexOf('<', openTag);
            if (openTag !== -1 && closeTag !== -1) {
                let raw = blockHtml.substring(openTag, closeTag).trim();
                raw = raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
                if(raw.toLowerCase() !== 'answer' && raw.length > 0 && raw.length < 100) {
                    correctAnswer = raw;
                }
            }
        }
    }

    // LAYER 2: Strong Tag Extraction (For Q2 style)
    if (correctAnswer === "Answer not found") {
        const strongMatch = blockHtml.match(/<strong>([^<]+)<\/strong>/g);
        if (strongMatch && strongMatch.length >= 2) {
            // Because first <strong> is "Answer label", take the second one
            let ans = strongMatch[1].replace(/<[^>]*>/g, '').trim();
            if(ans.toLowerCase() !== 'answer' && ans.length > 0 && ans.length < 100) {
                correctAnswer = ans;
            }
        } else if (strongMatch && strongMatch.length === 1) {
            // Fallback if only one strong exists (Q3/4 fallback)
            let ans = strongMatch[0].replace(/<[^>]*>/g, '').trim();
            if(ans.toLowerCase() !== 'answer' && ans.length > 0 && ans.length < 100) {
                correctAnswer = ans;
            }
        }
    }

    // LAYER 3: Green Background Text Extraction (For Q3 and Q4 style)
    if (correctAnswer === "Answer not found") {
        // Dhoondho Green color wala paragraph
        const greenMatch = blockHtml.match(/style="[^"]*background(?:-color)?:\s*#24ff2a[^"]*"[^>]*>([^<]+)<\/p>/i);
        if (greenMatch && greenMatch[1]) {
            let ans = greenMatch[1].trim();
            if(ans.toLowerCase() !== 'answer' && ans.length > 0 && ans.length < 100) {
                correctAnswer = ans;
            }
        }
    }

    // 4. Cleanup HTML entities
    question = question.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
    correctAnswer = correctAnswer.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}