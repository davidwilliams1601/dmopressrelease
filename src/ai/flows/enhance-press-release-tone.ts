'use server';

/**
 * @fileOverview Enhances the tone of a press release body copy to align with the organization's brand and tone notes.
 */

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

type ToneResult =
  | { success: true; data: EnhancePressReleaseToneOutput }
  | { success: false; error: string };

export async function enhancePressReleaseTone(input: EnhancePressReleaseToneInput): Promise<ToneResult> {
  try {
    const {ai} = await import('@/ai/genkit');

    const {output} = await ai.generate({
      prompt: `You are an expert copywriter specializing in press releases. Your task is to enhance the tone of the provided press release body copy to align with the organization's brand and tone notes.

Brand and Tone Notes: ${input.brandToneNotes}

Original Body Copy: ${input.bodyCopy}

Enhanced Body Copy:`,
      output: {schema: EnhancePressReleaseToneOutputSchema},
    });

    return { success: true, data: output! };
  } catch (error: any) {
    console.error('[AI Tone] Error:', error.message);
    console.error('[AI Tone] Stack:', error.stack);
    console.error('[AI Tone] GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
