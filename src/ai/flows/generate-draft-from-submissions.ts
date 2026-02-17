'use server';

import {z} from 'genkit';

const SubmissionInputSchema = z.object({
  title: z.string(),
  bodyCopy: z.string(),
  partnerName: z.string(),
  tags: z.array(z.string()),
  aiThemes: z.array(z.string()).optional(),
});

const GenerateDraftInputSchema = z.object({
  submissions: z.array(SubmissionInputSchema).describe('Partner submissions to combine into a press release'),
  brandToneNotes: z.string().describe('Organization brand and tone guidelines'),
  targetMarket: z.string().optional().describe('Target market for the press release'),
  additionalInstructions: z.string().optional().describe('Extra instructions for the AI'),
});

export type GenerateDraftInput = z.infer<typeof GenerateDraftInputSchema>;

const GenerateDraftOutputSchema = z.object({
  headline: z.string().describe('Press release headline'),
  bodyCopy: z.string().describe('Press release body copy'),
  suggestedCampaignType: z.string().describe('Suggested campaign type'),
  suggestedAudience: z.string().describe('Suggested audience: Travel Trade, Consumer, or Hybrid'),
});

export type GenerateDraftOutput = z.infer<typeof GenerateDraftOutputSchema>;

type GenerateDraftResult =
  | { success: true; data: GenerateDraftOutput }
  | { success: false; error: string };

export async function generateDraftFromSubmissions(
  input: GenerateDraftInput
): Promise<GenerateDraftResult> {
  try {
    const {ai} = await import('@/ai/genkit');

    const submissionsText = input.submissions
      .map(
        (s, i) => `--- Submission ${i + 1} (from ${s.partnerName}) ---
Title: ${s.title}
Tags: ${s.tags.join(', ')}
Themes: ${s.aiThemes?.join(', ') || 'Not analyzed'}
Content:
${s.bodyCopy}`
      )
      .join('\n\n');

    const {output} = await ai.generate({
      prompt: `You are an expert PR writer for a Destination Marketing Organization. Given the following partner submissions about tourism experiences, generate a professional press release draft that weaves them into a cohesive narrative organized by theme.

Brand Tone: ${input.brandToneNotes}
Target Market: ${input.targetMarket || 'General'}
Additional Instructions: ${input.additionalInstructions || 'None'}

Partner Submissions:
${submissionsText}

Generate a press release with:
1. A compelling headline
2. Professional body copy that combines the submissions into a cohesive story
3. A suggested campaign type (Seasonal, Product Launch, Event, Partnership, Award, or General)
4. A suggested audience (Travel Trade, Consumer, or Hybrid)

The body copy should be well-structured with paragraphs, quotes where appropriate, and a professional journalistic tone.`,
      output: {schema: GenerateDraftOutputSchema},
    });

    if (!output) {
      return {success: false, error: 'No output from AI model'};
    }

    return {success: true, data: output};
  } catch (error: any) {
    console.error('[Generate Draft] Error:', error.message);
    return {success: false, error: error.message || 'Unknown error during draft generation'};
  }
}
