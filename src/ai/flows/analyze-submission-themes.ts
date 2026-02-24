'use server';

import {z} from 'genkit';

const AnalyzeThemesInputSchema = z.object({
  title: z.string().describe('The submission title'),
  bodyCopy: z.string().describe('The submission content body'),
  expertPersona: z.string().optional().describe('The expert persona for the AI (e.g. "tourism and travel PR expert")'),
  themeExamples: z.string().optional().describe('Comma-separated examples of relevant themes'),
});

export type AnalyzeThemesInput = z.infer<typeof AnalyzeThemesInputSchema>;

const AnalyzeThemesOutputSchema = z.object({
  themes: z.array(z.string()).describe('2-5 discovered themes relevant to travel and tourism PR'),
  analysis: z.string().describe('A brief 2-3 sentence analysis of the content and its PR potential'),
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

    const {output} = await ai.generate({
      prompt: `You are a ${input.expertPersona ?? 'tourism and travel PR expert'}. Analyze the following content submission and identify the key themes.

Title: ${input.title}

Content:
${input.bodyCopy}

Identify 2-5 relevant themes (e.g., ${input.themeExamples ?? '"Cultural Heritage", "Adventure Tourism", "Food & Drink", "Family Activities", "Sustainability", "Events & Festivals", "Accommodation", "Nature & Wildlife"'}, etc.). Be specific and relevant to the content.`,
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
