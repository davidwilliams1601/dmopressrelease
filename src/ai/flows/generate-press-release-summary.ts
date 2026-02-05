'use server';

/**
 * @fileOverview Generates a short summary of a press release for use as an email intro.
 *
 * - generatePressReleaseSummary - A function that generates the summary.
 * - GeneratePressReleaseSummaryInput - The input type for the generatePressReleaseSummary function.
 * - GeneratePressReleaseSummaryOutput - The return type for the generatePressReleaseSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GeneratePressReleaseSummaryInputSchema = z.object({
  pressReleaseBody: z
    .string()
    .describe('The body of the press release to summarize.'),
});
export type GeneratePressReleaseSummaryInput = z.infer<
  typeof GeneratePressReleaseSummaryInputSchema
>;

const GeneratePressReleaseSummaryOutputSchema = z.object({
  summary: z
    .string()
    .describe('A short, one-sentence summary of the press release.'),
});
export type GeneratePressReleaseSummaryOutput = z.infer<
  typeof GeneratePressReleaseSummaryOutputSchema
>;

export async function generatePressReleaseSummary(
  input: GeneratePressReleaseSummaryInput
): Promise<GeneratePressReleaseSummaryOutput> {
  return generatePressReleaseSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generatePressReleaseSummaryPrompt',
  input: {schema: GeneratePressReleaseSummaryInputSchema},
  output: {schema: GeneratePressReleaseSummaryOutputSchema},
  prompt: `Summarize the following press release body in one short sentence for use as an email intro:\n\n{{{pressReleaseBody}}}`,
});

const generatePressReleaseSummaryFlow = ai.defineFlow(
  {
    name: 'generatePressReleaseSummaryFlow',
    inputSchema: GeneratePressReleaseSummaryInputSchema,
    outputSchema: GeneratePressReleaseSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
