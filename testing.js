export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS for browser access
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      // 2. Fetch the specific page from your prompt
      const url = "https://telenorquiztodays.pk/";
      const response = await fetch(url);
      const html = await response.text();

      // 3. Parse the HTML with Regex to find the Quiz Blocks
      // This regex matches each Question block, captures the Question text,
      // and captures the green "Answer" block at the bottom.
      const questionRegex = /<p[^>]*>[\s\n]*<strong>Question\s*(\d+):\s*(.*?)\?<\/strong>/gs;
      const answerRegex = /kt-adv-heading[^>]*>(.*?)<\/p>/s;

      const matches = [...html.matchAll(questionRegex)];
      const answers = [];

      if (matches.length === 0) {
        throw new Error("No questions found on the page.");
      }

      // 4. Loop through found questions to extract data
      for (let i = 0; i < matches.length; i++) {
        const fullMatch = matches[i][0];
        // Find the correct answer by looking for the green button HTML block within the same question container
        // We use a simplified search to locate the answer line following the question block
        const startIndex = html.indexOf(fullMatch);
        const searchEnd = html.indexOf(`Question ${parseInt(matches[i][1]) + 1}:`, startIndex);
        const segment = searchEnd === -1 ? html.slice(startIndex) : html.slice(startIndex, searchEnd);

        const answerMatch = segment.match(/kt-adv-heading[^>]*>\s*<strong>(.*?)<\/strong>/s);

        let correctAnswer = answerMatch ? answerMatch[1].trim() : "Answer not found";

        answers.push({
          "question": matches[i][2].trim() + "?",
          "correctAnswer": correctAnswer
        });
      }

      // 5. Format the final JSON response
      const jsonResponse = {
        "success": true,
        "searchedDate": "today",
        "totalQuestions": answers.length,
        "answers": answers,
        "developer": "Haseeb Sahil"
      };

      return new Response(JSON.stringify(jsonResponse, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        },
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        "success": false, 
        "error": error.message 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};