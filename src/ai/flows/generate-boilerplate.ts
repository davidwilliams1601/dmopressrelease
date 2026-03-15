'use server';

import { z } from 'genkit';

const GenerateBoilerplateInputSchema = z.object({
  orgName: z.string().describe('The organisation name'),
  vertical: z.string().describe('Organisation type e.g. Destination Marketing Organization, charity, trade body'),
  description: z.string().describe('Brief description or bullet points about the organisation'),
});

export type GenerateBoilerplateInput = z.infer<typeof GenerateBoilerplateInputSchema>;

const GenerateBoilerplateOutputSchema = z.object({
  boilerplate: z.string().describe('Professional "About" boilerplate paragraph'),
});

export type GenerateBoilerplateOutput = z.infer<typeof GenerateBoilerplateOutputSchema>;

type GenerateBoilerplateResult =
  | { success: true; data: GenerateBoilerplateOutput }
  | { success: false; error: string };

export async function generateBoilerplate(input: GenerateBoilerplateInput): Promise<GenerateBoilerplateResult> {
  try {
    const { ai } = await import('@/ai/genkit');

    const { output } = await ai.generate({
      prompt: `You are a professional PR copywriter. Write a concise "About" boilerplate paragraph for the following organisation.

Organisation Name: ${input.orgName}
Organisation Type: ${input.vertical}
Key Facts / Description: ${input.description}

Write a single professional boilerplate paragraph (3–5 sentences) suitable for the "Notes to Editors" section of a press release. It should be factual, authoritative, and written in the third person.`,
      output: { schema: GenerateBoilerplateOutputSchema },
    });

    return { success: true, data: output! };
  } catch (error: any) {
    console.error('[AI Boilerplate] Error:', error.message);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
