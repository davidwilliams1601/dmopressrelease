'use server';

/**
 * @fileOverview Generates press release headline options based on body copy and target market.
 */

import {z} from 'genkit';

const GeneratePressReleaseHeadlineInputSchema = z.object({
  bodyCopy: z.string().describe('The body copy of the press release.'),
  targetMarket: z.string().describe('The target market for the press release.'),
  toneNotes: z.string().optional().describe('Notes on the desired tone of the press release.'),
});
export type GeneratePressReleaseHeadlineInput = z.infer<typeof GeneratePressReleaseHeadlineInputSchema>;

const GeneratePressReleaseHeadlineOutputSchema = z.object({
  headlineOptions: z.array(z.string()).describe('An array of possible headline options.'),
});
export type GeneratePressReleaseHeadlineOutput = z.infer<typeof GeneratePressReleaseHeadlineOutputSchema>;

type HeadlineResult =
  | { success: true; data: GeneratePressReleaseHeadlineOutput }
  | { success: false; error: string };

export async function generatePressReleaseHeadline(input: GeneratePressReleaseHeadlineInput): Promise<HeadlineResult> {
  try {
    // Lazy import to avoid module-level initialization failures
    const {ai} = await import('@/ai/genkit');

    const {output} = await ai.generate({
      prompt: `You are an expert copywriter specializing in crafting compelling headlines for press releases.

  Based on the provided body copy and target market, generate three distinct headline options. Take into account the desired tone of the press release, if provided.

  Body Copy: ${input.bodyCopy}
  Target Market: ${input.targetMarket}
  Tone Notes: ${input.toneNotes || 'None provided'}

  Your response should be an array of strings representing the headline options. Do not include any other preamble or explanatory text.`,
      output: {schema: GeneratePressReleaseHeadlineOutputSchema},
    });

    return { success: true, data: output! };
  } catch (error: any) {
    console.error('[AI Headline] Error:', error.message);
    console.error('[AI Headline] Stack:', error.stack);
    console.error('[AI Headline] GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
