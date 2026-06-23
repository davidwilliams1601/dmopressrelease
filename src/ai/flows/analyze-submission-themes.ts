'use server';

import {z} from 'genkit';

const AnalyzeThemesInputSchema = z.object({
  title: z.string().describe('The submission title'),
  bodyCopy: z.string().describe('The submission content body'),
  expertPersona: z.string().optional().describe('The expert persona for the AI (e.g. "tourism and travel PR expert")'),
  themeExamples: z.string().optional().describe('Comma-separated examples of relevant themes'),
  contentTypeOptions: z.string().optional().describe('Comma-separated content type labels to choose from'),
  editorialPriorities: z.string().optional().describe('Org-specific editorial priorities to weight heavily when scoring'),
});

export type AnalyzeThemesInput = z.infer<typeof AnalyzeThemesInputSchema>;

const AnalyzeThemesOutputSchema = z.object({
  themes: z.array(z.string()).describe('2-5 discovered themes relevant to the content'),
  analysis: z.string().describe('A brief 2-3 sentence assessment of the content and its editorial/PR potential'),
  editorialScore: z.number().describe('Editorial worth, a whole number from 1 (low) to 10 (excellent)'),
  editorialRationale: z.string().describe('One to two sentences explaining the score'),
  contentType: z.string().describe('The single best-fit content type label'),
});

export type AnalyzeThemesOutput = z.infer<typeof AnalyzeThemesOutputSchema>;

type AnalyzeThemesResult =
  | { success: true; data: AnalyzeThemesOutput }
  | { success: false; error: string };

export async function analyzeSubmissionThemes(
  input: AnalyzeThemesInput
): Promise<AnalyzeThemesResult> {
  try {
    const {ai} = await import('@/ai/genkit');

    const persona = input.expertPersona ?? 'tourism and travel PR expert';
    const themeExamples = input.themeExamples ?? '"Cultural Heritage", "Adventure Tourism", "Food & Drink", "Family Activities", "Sustainability", "Events & Festivals", "Accommodation", "Nature & Wildlife"';
    const contentTypeOptions = input.contentTypeOptions ?? '"What\'s New", "Event Listing", "Destination Guide", "Seasonal Update", "General"';
    const prioritiesBlock = input.editorialPriorities?.trim()
      ? `\n\nORGANISATION EDITORIAL PRIORITIES (weight these heavily when scoring):\n${input.editorialPriorities.trim()}`
      : '';

    const {output} = await ai.generate({
      prompt: `You are a ${persona}. Analyse the following content submission and return a structured assessment.

Title: ${input.title}

Content:
${input.bodyCopy}

THEMES: Identify 2-5 relevant themes (e.g., ${themeExamples}, etc.). Be specific and relevant to the content.

EDITORIAL SCORE: Rate 1-10 as a whole number based on editorial relevance, news value, writing quality, and completeness.
1-3 = low value (off-topic, purely promotional, or too thin to use)
4-6 = moderate (relevant but needs work, or limited news angle)
7-8 = good (clear value, editorial-ready with minor polish)
9-10 = excellent (strong hook, high-quality writing, immediately usable)
Provide a one to two sentence rationale for the score.${prioritiesBlock}

CONTENT TYPE: Choose the single best fit from: ${contentTypeOptions}`,
      output: {schema: AnalyzeThemesOutputSchema},
    });

    if (!output) {
      return {success: false, error: 'No output from AI model'};
    }

    return {success: true, data: output};
  } catch (error: any) {
    console.error('[Analyze Themes] Error:', error.message);
    return {success: false, error: error.message || 'Unknown error during theme analysis'};
  }
}
