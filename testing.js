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

  // 1. Split HTML into 5 Question Blocks 
  const questionLabels = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];
  
  for (let i = 0; i < questionLabels.length; i++) {
    const currentLabel = questionLabels[i];
    const nextLabel = i < questionLabels.length - 1 ? questionLabels[i + 1] : null;
    
    let startIndex = html.indexOf(currentLabel);
    let endIndex = nextLabel ? html.indexOf(nextLabel, startIndex + 1) : html.length;
    
    // Safety: Cut off extra content like FAQs from Q5 block
    const faqsIndex = html.indexOf('FAQs', startIndex);
    if (faqsIndex !== -1 && faqsIndex < endIndex) {
        endIndex = faqsIndex;
    }

    if (startIndex === -1) continue;
    
    let blockHtml = html.substring(startIndex, endIndex);

    // 2. Extract Clean Question
    let question = `Question ${i+1}:`;
    // Regex: "Question X:" ke baad ka text uthao jab tak options start na ho jayen
    let qMatch = blockHtml.match(/Question\s*\d+:\s*([^<]+?)(?=\s*<br\s*\/?>|\s*<p|\s*<ul|\s*<strong)/i);
    if (qMatch && qMatch[1]) {
        question = "Question " + (i+1) + ": " + qMatch[1].trim();
    }

    // 3. Extract Correct Answer (Target EXACT Green Button)
    let correctAnswer = "Answer not found";

    // Step A: Search for the exact Green Button Class 
    // Response.html me Green button ki class hai: "kt-adv-heading14_b823be-d9"
    const greenBtnIndex = blockHtml.indexOf('class="kt-adv-heading14_b823be-d9"');
    
    if (greenBtnIndex !== -1) {
        // Step B: Class start (>) ke baad ka text uthana
        // '>' aur uske baad wale '<' ke beech ka HTML content extract karna
        const closeTagIndex = blockHtml.indexOf('>', greenBtnIndex);
        if (closeTagIndex !== -1) {
            const contentStart = closeTagIndex + 1;
            const contentEnd = blockHtml.indexOf('<', contentStart);
            
            if (contentStart !== -1 && contentEnd !== -1) {
                let extractedHtml = blockHtml.substring(contentStart, contentEnd).trim();
                
                // Step C: Remove ALL HTML tags (including <strong>, <p>, <br>, etc.)
                let extracted = extractedHtml.replace(/<[^>]*>/g, ' ').trim();
                
                // Step D: Clean HTML entities & fix multiple spaces
                extracted = extracted.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
                
                // Step E: Filter out "Answer" label
                if (extracted.toLowerCase() !== 'answer' && extracted.length > 0 && extracted.length < 200) {
                    correctAnswer = extracted;
                }
            }
        }
    }

    // 4. Cleanup HTML entities for Question
    question = question.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}