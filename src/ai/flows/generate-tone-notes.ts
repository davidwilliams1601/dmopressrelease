'use server';

import { z } from 'genkit';

const GenerateToneNotesInputSchema = z.object({
  orgName: z.string().describe('The organisation name'),
  vertical: z.string().describe('Organisation type e.g. Destination Marketing Organization, charity, trade body'),
  boilerplate: z.string().optional().describe('The organisation boilerplate text'),
});

export type GenerateToneNotesInput = z.infer<typeof GenerateToneNotesInputSchema>;

const GenerateToneNotesOutputSchema = z.object({
  toneNotes: z.string().describe('Brand tone and voice guidelines for use in AI prompts'),
});

export type GenerateToneNotesOutput = z.infer<typeof GenerateToneNotesOutputSchema>;

type GenerateToneNotesResult =
  | { success: true; data: GenerateToneNotesOutput }
  | { success: false; error: string };

export async function generateToneNotes(input: GenerateToneNotesInput): Promise<GenerateToneNotesResult> {
  try {
    const { ai } = await import('@/ai/genkit');

    const boilerplateSection = input.boilerplate
      ? `\nOrganisation Boilerplate:\n${input.boilerplate}`
      : '';

    const { output } = await ai.generate({
      prompt: `You are a brand strategist. Based on the organisation details below, write concise brand tone and voice guidelines that will be used to guide an AI when writing press releases and marketing copy.

Organisation Name: ${input.orgName}
Organisation Type: ${input.vertical}${boilerplateSection}

Write 4–6 short, practical guidelines describing the tone, style, and language this organisation should use. Format as plain prose (no bullet points). Focus on: formality level, emotional register, vocabulary style, what to emphasise, and what to avoid.`,
      output: { schema: GenerateToneNotesOutputSchema },
    });

    return { success: true, data: output! };
  } catch (error: any) {
    console.error('[AI Tone Notes] Error:', error.message);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
