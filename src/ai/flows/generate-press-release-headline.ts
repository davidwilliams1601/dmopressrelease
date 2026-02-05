'use server';

/**
 * @fileOverview Generates press release headline options based on body copy and target market.
 *
 * - generatePressReleaseHeadline - A function that generates headline options.
 * - GeneratePressReleaseHeadlineInput - The input type for the generatePressReleaseHeadline function.
 * - GeneratePressReleaseHeadlineOutput - The return type for the generatePressReleaseHeadline function.
 */

import {ai} from '@/ai/genkit';
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

export async function generatePressReleaseHeadline(input: GeneratePressReleaseHeadlineInput): Promise<GeneratePressReleaseHeadlineOutput> {
  return generatePressReleaseHeadlineFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generatePressReleaseHeadlinePrompt',
  input: {schema: GeneratePressReleaseHeadlineInputSchema},
  output: {schema: GeneratePressReleaseHeadlineOutputSchema},
  prompt: `You are an expert copywriter specializing in crafting compelling headlines for press releases.

  Based on the provided body copy and target market, generate three distinct headline options. Take into account the desired tone of the press release, if provided.

  Body Copy: {{{bodyCopy}}}
  Target Market: {{{targetMarket}}}
  Tone Notes: {{{toneNotes}}}

  Your response should be an array of strings representing the headline options. Do not include any other preamble or explanatory text.
  `,
});

const generatePressReleaseHeadlineFlow = ai.defineFlow(
  {
    name: 'generatePressReleaseHeadlineFlow',
    inputSchema: GeneratePressReleaseHeadlineInputSchema,
    outputSchema: GeneratePressReleaseHeadlineOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
