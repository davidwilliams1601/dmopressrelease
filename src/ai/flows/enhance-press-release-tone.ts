'use server';

/**
 * @fileOverview Enhances the tone of a press release body copy to align with the organization's brand and tone notes.
 *
 * - enhancePressReleaseTone - A function that enhances the tone of the press release.
 * - EnhancePressReleaseToneInput - The input type for the enhancePressReleaseTone function.
 * - EnhancePressReleaseToneOutput - The return type for the enhancePressReleaseTone function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EnhancePressReleaseToneInputSchema = z.object({
  bodyCopy: z.string().describe('The body copy of the press release.'),
  brandToneNotes: z.string().describe('The brand and tone notes of the organization.'),
});
export type EnhancePressReleaseToneInput = z.infer<typeof EnhancePressReleaseToneInputSchema>;

const EnhancePressReleaseToneOutputSchema = z.object({
  enhancedBodyCopy: z.string().describe('The enhanced body copy of the press release.'),
});
export type EnhancePressReleaseToneOutput = z.infer<typeof EnhancePressReleaseToneOutputSchema>;

export async function enhancePressReleaseTone(input: EnhancePressReleaseToneInput): Promise<EnhancePressReleaseToneOutput> {
  return enhancePressReleaseToneFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enhancePressReleaseTonePrompt',
  input: {schema: EnhancePressReleaseToneInputSchema},
  output: {schema: EnhancePressReleaseToneOutputSchema},
  prompt: `You are an expert copywriter specializing in press releases. Your task is to enhance the tone of the provided press release body copy to align with the organization's brand and tone notes.

Brand and Tone Notes: {{{brandToneNotes}}}

Original Body Copy: {{{bodyCopy}}}

Enhanced Body Copy:`,
});

const enhancePressReleaseToneFlow = ai.defineFlow(
  {
    name: 'enhancePressReleaseToneFlow',
    inputSchema: EnhancePressReleaseToneInputSchema,
    outputSchema: EnhancePressReleaseToneOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
