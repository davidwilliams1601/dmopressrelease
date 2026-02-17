import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Cloud Function triggered when a new partner submission is created.
 * Automatically analyzes the submission content using Gemini AI
 * to discover themes and provide analysis.
 */
export const analyzeSubmissionThemes = functions
  .runWith({ timeoutSeconds: 120 })
  .firestore
  .document('orgs/{orgId}/submissions/{submissionId}')
  .onCreate(async (snap, context) => {
    const { orgId, submissionId } = context.params;
    const submission = snap.data();

    console.log(`Analyzing themes for submission ${submissionId} in org ${orgId}`);

    const geminiApiKey = functions.config().gemini?.key || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.warn('Gemini API key not configured. Skipping theme analysis.');
      return;
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const prompt = `You are a tourism and travel PR expert. Analyze the following content submission from a tourism partner and identify the key themes.

Title: ${submission.title}

Content:
${submission.bodyCopy}

Please respond in valid JSON format with this exact structure:
{
  "themes": ["Theme 1", "Theme 2", "Theme 3"],
  "analysis": "A brief 2-3 sentence analysis of the content and its PR potential."
}

Identify 2-5 themes relevant to travel and tourism PR (e.g., "Cultural Heritage", "Adventure Tourism", "Food & Drink", "Family Activities", "Sustainability", "Events & Festivals", "Accommodation", "Nature & Wildlife", etc.). Be specific and relevant to the content.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Parse the JSON response - handle markdown code blocks
      let parsed: { themes: string[]; analysis: string };
      try {
        const cleaned = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('Failed to parse AI response:', responseText);
        parsed = {
          themes: ['General'],
          analysis: 'Unable to analyze content automatically. Manual review recommended.',
        };
      }

      // Update the submission with AI results
      await snap.ref.update({
        aiThemes: parsed.themes,
        aiThemeAnalysis: parsed.analysis,
        aiAnalyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Theme analysis complete for submission ${submissionId}: ${parsed.themes.join(', ')}`);
    } catch (error: any) {
      console.error(`Error analyzing submission ${submissionId}:`, error);
      // Don't fail the function - the submission was created successfully
      // Team can manually trigger re-analysis later
    }
  });
