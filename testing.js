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
  const TARGET_URL = `https://wikitechlibrary.com/today-telenor-quiz-answers/`;
  
  // Cookies (From DevTools Screenshot)
  const cookies = [
    "_ga=GA1.1.817417446.1784556439;",
    "_ga_GS3JBW98QMB=GS2.1.1784640421.3.0.1784640460.0.0.0;",
    "__cf_bm=t.GBiW7dGBk6_ESU7rYBRxfBhKLGQRKkmJ1sYdqHqXGk-1784640439-1.0.1.1-uCl_j3P6FvUpd.kxyqo_m3spPjCQNy.yK9Sm77RrbcWd0Wc.xBvSnr37OeUjvEENubDnp0jrmbQaFniJbp4Y6Q"
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

  // 1. HTML ko 5 Question Blocks mein todna
  const questionLabels = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];
  
  for (let i = 0; i < questionLabels.length; i++) {
    const currentLabel = questionLabels[i];
    const nextLabel = i < questionLabels.length - 1 ? questionLabels[i + 1] : null;
    
    let startIndex = html.indexOf(currentLabel);
    let endIndex = nextLabel ? html.indexOf(nextLabel, startIndex + 1) : html.length;
    
    // Safety: Cut off extra content after Question 5
    const extraCutoffIndex = html.indexOf('Quiz Rules', startIndex);
    if (extraCutoffIndex !== -1 && extraCutoffIndex < endIndex && i === 4) {
        endIndex = extraCutoffIndex;
    }

    if (startIndex === -1) continue;
    
    let blockHtml = html.substring(startIndex, endIndex);

    // 2. Extract Clean Question (Remove "Question 1: " prefix)
    let question = `Question ${i+1}:`;
    let qMatch = blockHtml.match(/<h3[^>]*>(.*?)<\/h3>/i);
    if (qMatch && qMatch[1]) {
        let raw = qMatch[1].replace(/<[^>]*>/g, '').replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
        question = "Question " + (i+1) + ": " + raw;
    }

    // 3. Extract Correct Answer (Target EXACT Green Box Class)
    let correctAnswer = "Answer not found";

    // Step A: Search for the exact Green Box Class: "answer1"
    // This class is used for the correct answer boxes
    const answerBoxClass = 'class="answer1"';
    const answerBoxIndex = blockHtml.indexOf(answerBoxClass);
    
    if (answerBoxIndex !== -1) {
        // Step B: Find the start of the text inside the class
        const contentStart = blockHtml.indexOf('>', answerBoxIndex) + 1;
        if (contentStart !== -1) {
            // Step C: Find the end of the text (next closing tag)
            const contentEnd = blockHtml.indexOf('</div>', contentStart);
            if (contentEnd !== -1) {
                let rawText = blockHtml.substring(contentStart, contentEnd).trim();
                
                // Step D: Clean up HTML tags and entities
                rawText = rawText.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
                
                // Step E: Remove "Answer:" prefix if it exists
                let cleanAnswer = rawText.replace(/^Answer:\s*/i, '').trim();
                
                // Step F: Validate
                if (cleanAnswer.length > 0 && cleanAnswer.length < 200) {
                    correctAnswer = cleanAnswer;
                }
            }
        }
    }

    // 4. Final Cleanup (Remove extra spaces and quotes)
    question = question.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
    correctAnswer = correctAnswer.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}