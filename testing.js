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
  const TARGET_URL = `https://mytelenoranswertoday.pk/`;
  
  // Cookies (From DevTools Screenshots)
  const cookies = [
    "_ga=GA1.1.1649597395.1784556291;",
    "_ga_GS8LVG5EDC=GS2.1.1784640995.4.0.1784641040.0.0.0;",
    "__cf_bm=5FJwBp2V8NzK9HwWpLQTCg53PMHZ8wPcWXWm1K0H72mXY-1784640996-1.0.1.1-tv0u1aRfJXgE9.5Z4AQd6i3dZoc_K.BESrW8Cmaay0;"
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
    
    // Safety: Cut off extra content
    const extraCutoffIndex = html.indexOf('Video Guide', startIndex);
    if (extraCutoffIndex !== -1 && extraCutoffIndex < endIndex && i === 4) {
        endIndex = extraCutoffIndex;
    }

    if (startIndex === -1) continue;
    
    let blockHtml = html.substring(startIndex, endIndex);

    // 2. Extract Clean Question (Remove Options)
    let question = `Question ${i+1}:`;
    // FIX: Question ke baad "<br />" tak rukna (Options se pehle)
    let qMatch = blockHtml.match(/Question\s*\d+:\s*([^<]+?)(?=\s*<br\s*\/?>)/i);
    if (qMatch && qMatch[1]) {
        question = "Question " + (i+1) + ": " + qMatch[1].trim();
    }

    // 3. Extract Correct Answer (Target EXACT Green Button Class)
    let correctAnswer = "Answer not found";

    // Step A: Search for the exact Green Button Class ID
    const greenBtnClass = 'class="kt-adv-heading11_549588-20"';
    const greenBtnIndex = blockHtml.indexOf(greenBtnClass);
    
    if (greenBtnIndex !== -1) {
        // Step B: Class ke andar ka text uthana
        const closeTagIndex = blockHtml.indexOf('>', greenBtnIndex);
        if (closeTagIndex !== -1) {
            const textStart = closeTagIndex + 1;
            const textEnd = blockHtml.indexOf('<', textStart);
            
            if (textStart !== -1 && textEnd !== -1) {
                let extracted = blockHtml.substring(textStart, textEnd).trim();
                extracted = extracted.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
                
                // Step C: Agar "Answer" mila, toh uske baad wala agla text uthao
                if (extracted.toLowerCase() === 'answer') {
                    // Dhoondho uske baad wala agla tag (Real Answer)
                    const nextTagStart = blockHtml.indexOf('>', textEnd);
                    if (nextTagStart !== -1) {
                        const nextTextStart = nextTagStart + 1;
                        const nextTextEnd = blockHtml.indexOf('<', nextTextStart);
                        if (nextTextStart !== -1 && nextTextEnd !== -1) {
                            let realAnswer = blockHtml.substring(nextTextStart, nextTextEnd).trim();
                            realAnswer = realAnswer.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
                            
                            if (realAnswer.length > 0 && realAnswer.length < 200) {
                                correctAnswer = realAnswer;
                            }
                        }
                    }
                } else if (extracted.length > 0 && extracted.length < 200) {
                    // Agar "Answer" label nahi hai, toh seedha text uthao (Q2 style)
                    correctAnswer = extracted;
                }
            }
        }
    }

    // 4. Final Cleanup
    question = question.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();
    correctAnswer = correctAnswer.replace(/&nbsp;|&#8220;|&#8221;|&ldquo;|&rdquo;|&amp;/g, ' ').trim();

    results.push({
      question: question,
      correctAnswer: correctAnswer
    });
  }

  return results;
}