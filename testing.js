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

    if (!query) {
      return jsonResponse({ 
        success: false, 
        error: "Missing 'query' or 'q' parameter. Use ?query=20-july-2026" 
      }, 400);
    }

    // Valid date format check (optional, if you want strict)
    // const cleaned = query.trim();
    
    try {
      const answers = await scrapeTelenorQuiz(query);
      
      if (!answers || answers.length === 0) {
        return jsonResponse({
          success: true,
          searchedDate: query,
          answers: "No Record Found",
          developer: "Haseeb Sahil"
        });
      }

      return jsonResponse({
        success: true,
        searchedDate: query,
        totalQuestions: answers.length,
        answers: answers,
        developer: "Haseeb Sahil"
      });

    } catch (error) {
      return jsonResponse({
        success: false,
        error: "Scraping failed. Check date format or target site.",
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
  // Ensure URL format matches. Example: 20-july-2026
  const TARGET_URL = `https://telenorquiztodays.pk/`;
  
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
  };

  const response = await fetch(TARGET_URL, { headers });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch page. Status: ${response.status}`);
  }

  const html = await response.text();

  // ---------- PARSING LOGIC ----------
  const results = [];

  // 1. Extract ALL Questions and Answer Blocks directly from the page
  // We match patterns that look like: <strong>Question X: ...</strong>
  const questionBlocks = html.match(/<strong>Question\s*\d+:[\s\S]*?<\/strong>/gi) || [];

  if (questionBlocks.length === 0) {
    throw new Error("No questions found on the page. Layout may have changed.");
  }

  // 2. Loop through each Question block to find the Correct Answer
  for (const block of questionBlocks) {
    // Extract Question Text
    const questionMatch = block.match(/Question\s*\d+:\s*([^<]+)/i);
    const questionText = questionMatch ? questionMatch[1].trim() : "Unknown Question";

    // 3. Find the correct answer for this specific question
    // In the HTML, the correct answer is wrapped in a green button/text usually containing "Answer" label.
    // We use a regex to find the text immediately inside the "Answer" section that comes AFTER this question block.
    
    let correctAnswer = "Answer not found";
    
    // Strategy: Look for the Answer label in the HTML, and capture the text right after it that looks like the answer.
    // The source HTML shows: <strong>Answer</strong> ... <strong>Feeling sick</strong> inside the green box.
    
    // We can target the parent container of the question to be safer.
    // Since the HTML is well-structured Kadence blocks, we can find the Answer text by locating "Answer" and then the adjacent text.
    
    // Let's try a simpler method: Find all bold texts inside the document that are NOT part of the question.
    // But a more reliable way: The HTML has a specific class or style for the green box.
    // The screenshot shows a green background. Let's look for green backgrounds.
    
    const greenBoxMatch = html.match(/<p[^>]*class="[^"]*kt-adv-heading[^"]*"[^>]*style="[^"]*background-color:[^"]*#24ff2a[^"]*"[^>]*>([^<]+)<\/p>/i);
    
    // Since we need question-specific answers, we need to split HTML into sections.
    // Let's split the HTML by "Question X:" to create independent blocks.
  }

  // More robust method: Split entire HTML into Question segments using "Question X:"
  const sections = html.split(/(Question\s*\d+:\s*)/gi);
  
  // sections[0] is header, sections[1] is "Question 1:", sections[2] is content of Q1, etc.
  // We iterate through the sections array
  for (let i = 1; i < sections.length; i += 2) {
    const qHeader = sections[i];
    const qContent = sections[i+1] || "";

    const questionMatch = qHeader.match(/Question\s*\d+:\s*([^<]+)/i);
    const questionText = questionMatch ? questionMatch[1].trim() : "Unknown Question";

    // Look for the Green Answer button within this specific qContent
    // Green button style: background-color: #24ff2a OR class="kt-adv-heading... with green background
    const greenMatch = qContent.match(/background-color:\s*#24ff2a[^>]*>([^<]+)<\//i) ||
                       qContent.match(/class="[^"]*kt-adv-heading[^"]*"[^>]*style="[^"]*#[^"]*"[^>]*>([^<]+)<\//i);
    
    let correctAnswer = greenMatch ? greenMatch[1].trim() : "Answer not found in this block";
    
    // Clean up the answer string
    if (correctAnswer.includes('&nbsp;')) {
      correctAnswer = correctAnswer.replace(/&nbsp;/g, ' ').trim();
    }

    results.push({
      question: questionText,
      correctAnswer: correctAnswer
    });
  }

  // Limit to 5 questions if more are captured
  return results.slice(0, 5);
}