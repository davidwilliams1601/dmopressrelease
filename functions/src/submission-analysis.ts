import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { callWithRetry } from './ai-helpers';

// Vertical-specific scoring context injected into the analysis prompt.
// Keeps the prompt lean while making scoring criteria meaningful per vertical.
const VERTICAL_SCORING_CONTEXT: Record<string, {
  expertPersona: string;
  themeExamples: string;
  scoringCriteria: string;
  contentTypeOptions: string;
}> = {
  publisher: {
    expertPersona: 'further education editorial journalist and commissioning editor',
    themeExamples: '"Apprenticeships", "T-Levels", "Skills Policy", "Ofsted & Regulation", "Higher Technical Qualifications", "Digital Skills", "Employer Partnerships", "Inclusion & SEND", "EdTech & Innovation", "Funding & Finance", "Leadership & Governance", "Workforce Development"',
    scoringCriteria: `Score on:
- Editorial relevance: Is this genuinely relevant to FE, skills, and workforce development practitioners?
- News value: Does it have a clear hook — new data, policy change, initiative launch, strong opinion?
- Writing quality: Is it coherent, well-structured, and readable without heavy editing?
- Completeness: Does it have enough substance to publish, or is it a thin stub?`,
    contentTypeOptions: '"News Story", "Thought Leadership", "Case Study", "Event", "Press Release", "Policy Update", "General"',
  },
  dmo: {
    expertPersona: 'tourism and travel PR expert',
    themeExamples: '"Cultural Heritage", "Adventure Tourism", "Food & Drink", "Family Activities", "Sustainability", "Events & Festivals", "Accommodation", "Nature & Wildlife"',
    scoringCriteria: `Score on:
- PR relevance: Is this compelling for travel trade or consumer press?
- News value: Is there a strong, timely angle — new opening, award, seasonal campaign, unique experience?
- Writing quality: Is the copy engaging and publication-ready?
- Completeness: Does it include enough detail (dates, prices, booking info where relevant)?`,
    contentTypeOptions: '"What\'s New", "Event Listing", "Destination Guide", "Seasonal Update", "General"',
  },
  charity: {
    expertPersona: 'charity PR and communications expert',
    themeExamples: '"Community Impact", "Fundraising", "Volunteer Stories", "Service Delivery", "Awareness Campaigns", "Events", "Partnerships", "Policy"',
    scoringCriteria: `Score on:
- Story impact: Does this demonstrate clear community or human impact?
- Media worthiness: Would a journalist find a compelling angle here?
- Writing quality: Is it clear, empathetic, and well-structured?
- Completeness: Does it include real outcomes, quotes, or data?`,
    contentTypeOptions: '"Campaign Update", "Impact Story", "Event", "News", "General"',
  },
  'trade-body': {
    expertPersona: 'trade body and industry communications expert',
    themeExamples: '"Industry Trends", "Member Spotlight", "Policy & Regulation", "Market Data", "Awards", "Events", "Advocacy", "Innovation"',
    scoringCriteria: `Score on:
- Industry relevance: Is this genuinely significant for sector stakeholders?
- News value: Is there new data, a policy development, or a notable member achievement?
- Writing quality: Is it authoritative and appropriately professional?
- Completeness: Does it have sufficient context for a trade audience?`,
    contentTypeOptions: '"Industry News", "Member Spotlight", "Policy Update", "Report & Data", "General"',
  },
};

const DEFAULT_SCORING_CONTEXT = VERTICAL_SCORING_CONTEXT['dmo'];

/**
 * Cloud Function triggered when a new partner submission is created.
 * Analyzes submission content using Gemini AI to produce:
 *  - themes (2-5 relevant topic tags)
 *  - themeAnalysis (brief PR/editorial assessment)
 *  - editorialScore (1-10) — how worth featuring this submission is
 *  - editorialRationale (1-2 sentences explaining the score)
 *  - contentType (suggested format label)
 *
 * Vertical-aware: looks up the org's vertical to apply appropriate scoring criteria.
 */
export const analyzeSubmissionThemes = functions
  .runWith({ timeoutSeconds: 120 })
  .firestore
  .document('orgs/{orgId}/submissions/{submissionId}')
  .onCreate(async (snap, context) => {
    const { orgId, submissionId } = context.params;
    const submission = snap.data();

    console.log(`Analyzing submission ${submissionId} in org ${orgId}`);

    const geminiApiKey = functions.config().gemini?.key || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.warn('Gemini API key not configured. Skipping analysis.');
      return;
    }

    // Look up org to get vertical, so scoring criteria match the organisation type
    let verticalCtx = DEFAULT_SCORING_CONTEXT;
    try {
      const orgSnap = await admin.firestore().collection('orgs').doc(orgId).get();
      const vertical = orgSnap.data()?.vertical as string | undefined;
      if (vertical && VERTICAL_SCORING_CONTEXT[vertical]) {
        verticalCtx = VERTICAL_SCORING_CONTEXT[vertical];
      }
    } catch (err) {
      console.warn(`Could not fetch org vertical for ${orgId}, using default:`, err);
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `You are a ${verticalCtx.expertPersona}. Analyse the following content submission and return a structured JSON assessment.

Title: ${submission.title}

Content:
${submission.bodyCopy}

---

Respond in valid JSON with this exact structure:
{
  "themes": ["Theme 1", "Theme 2"],
  "analysis": "A brief 2-3 sentence assessment of the content and its editorial potential.",
  "editorialScore": 7,
  "editorialRationale": "One to two sentences explaining the score — what makes this strong or weak.",
  "contentType": "News Story"
}

THEMES: Identify 2-5 relevant themes from examples such as ${verticalCtx.themeExamples}. Be specific to the content.

EDITORIAL SCORE: Rate 1-10 as a whole number.
${verticalCtx.scoringCriteria}
1-3 = low value (off-topic, purely promotional, or too thin to use)
4-6 = moderate (relevant but needs work, or limited news angle)
7-8 = good (clear value, editorial-ready with minor polish)
9-10 = excellent (strong hook, high-quality writing, immediately usable)

CONTENT TYPE: Choose the single best fit from: ${verticalCtx.contentTypeOptions}`;

      const result = await callWithRetry(
        () => model.generateContent(prompt),
        null,
        'analyzeSubmission',
      );

      if (!result) {
        console.warn(`AI analysis returned null for submission ${submissionId}. Skipping.`);
        return;
      }

      const responseText = result.response.text();

      let parsed: {
        themes: string[];
        analysis: string;
        editorialScore: number;
        editorialRationale: string;
        contentType: string;
      };

      try {
        const cleaned = responseText
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('Failed to parse AI response for submission', submissionId, ':', responseText);
        parsed = {
          themes: ['General'],
          analysis: 'Unable to analyse content automatically. Manual review recommended.',
          editorialScore: 5,
          editorialRationale: 'Automatic scoring unavailable — please review manually.',
          contentType: 'General',
        };
      }

      // Clamp score to 1-10 in case the model drifts
      const safeScore = Math.min(10, Math.max(1, Math.round(Number(parsed.editorialScore) || 5)));

      await snap.ref.update({
        aiThemes: parsed.themes,
        aiThemeAnalysis: parsed.analysis,
        aiEditorialScore: safeScore,
        aiEditorialRationale: parsed.editorialRationale || '',
        aiContentType: parsed.contentType || 'General',
        aiAnalyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `Analysis complete for submission ${submissionId}: ` +
        `score=${safeScore}, type=${parsed.contentType}, themes=${parsed.themes.join(', ')}`
      );
    } catch (error: any) {
      console.error(`Error analysing submission ${submissionId}:`, error);
      // Don't fail the function — the submission was created successfully
    }
  });
