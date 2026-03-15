'use server';

import { z } from 'genkit';

const ImproveSubmissionCopyInputSchema = z.object({
  title: z.string().describe('The submission title'),
  bodyCopy: z.string().describe('The partner\'s draft content — may be rough notes or bullet points'),
  partnerName: z.string().optional().describe('The partner\'s business name'),
});

export type ImproveSubmissionCopyInput = z.infer<typeof ImproveSubmissionCopyInputSchema>;

const ImproveSubmissionCopyOutputSchema = z.object({
  improvedCopy: z.string().describe('Polished, press-team-ready version of the submission copy'),
});

export type ImproveSubmissionCopyOutput = z.infer<typeof ImproveSubmissionCopyOutputSchema>;

type ImproveSubmissionCopyResult =
  | { success: true; data: ImproveSubmissionCopyOutput }
  | { success: false; error: string };

export async function improveSubmissionCopy(input: ImproveSubmissionCopyInput): Promise<ImproveSubmissionCopyResult> {
  try {
    const { ai } = await import('@/ai/genkit');

    const partnerLine = input.partnerName ? `\nBusiness Name: ${input.partnerName}` : '';

    const { output } = await ai.generate({
      prompt: `You are helping a business partner write a news submission that will be reviewed by a press team and potentially included in a press release.

Title: ${input.title}${partnerLine}
Draft Content:
${input.bodyCopy}

Rewrite the content above as a clear, well-structured, press-team-friendly piece. Keep all the factual details and key messages from the original. Improve the structure, grammar, and flow. Write in a professional but engaging tone, in the third person where appropriate. Do not invent facts or add information that wasn't in the original.`,
      output: { schema: ImproveSubmissionCopyOutputSchema },
    });

    return { success: true, data: output! };
  } catch (error: any) {
    console.error('[AI Improve Submission] Error:', error.message);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
