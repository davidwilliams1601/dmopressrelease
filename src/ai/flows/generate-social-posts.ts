'use server';

import { z } from 'genkit';

const GenerateSocialPostsInputSchema = z.object({
  headline: z.string().describe('Press release headline'),
  bodyCopy: z.string().describe('Press release body copy'),
  orgName: z.string().describe('Organization name'),
  brandToneNotes: z.string().optional().describe('Brand tone guidelines'),
  targetMarket: z.string().optional().describe('Target market'),
});

export type GenerateSocialPostsInput = z.infer<typeof GenerateSocialPostsInputSchema>;

const GenerateSocialPostsOutputSchema = z.object({
  linkedin: z.string().describe('LinkedIn post — professional, 150–300 words, 3–5 hashtags'),
  twitter: z.string().describe('X/Twitter post — max 280 characters including hashtags'),
  facebook: z.string().describe('Facebook post — warm and conversational, 50–100 words, 2–3 hashtags'),
  instagram: z.string().describe('Instagram caption — vivid and inspirational, 50–100 words, 8–12 hashtags'),
});

export type GenerateSocialPostsOutput = z.infer<typeof GenerateSocialPostsOutputSchema>;

type SocialPostsResult =
  | { success: true; data: GenerateSocialPostsOutput }
  | { success: false; error: string };

export async function generateSocialPosts(
  input: GenerateSocialPostsInput
): Promise<SocialPostsResult> {
  try {
    const { ai } = await import('@/ai/genkit');

    const { output } = await ai.generate({
      prompt: `You are a social media expert for ${input.orgName}, a destination marketing organization.

Generate social media posts to announce the following press release. Adapt tone, length, and style for each platform. Use "[Link]" as a placeholder where the team will add their URL.

Press Release Headline: ${input.headline}

Body Copy (excerpt):
${input.bodyCopy.slice(0, 600)}
${input.brandToneNotes ? `\nBrand Tone: ${input.brandToneNotes}` : ''}${input.targetMarket ? `\nTarget Market: ${input.targetMarket}` : ''}

Platform requirements:
- LinkedIn: Professional, informative tone for a B2B travel trade audience. 150–300 words. Include 3–5 relevant hashtags at the end. Include "[Link]".
- X/Twitter: Punchy and attention-grabbing. STRICT 280 character maximum (count carefully, including spaces and hashtags). Include 2–3 hashtags and "[Link]".
- Facebook: Warm and conversational. 50–100 words. Encourage engagement with a question or call to action. Include 2–3 hashtags and "[Link]".
- Instagram: Vivid, inspirational, and visual in feel. 50–100 words with natural line breaks. Include 8–12 hashtags at the end and "[Link]".`,
      output: { schema: GenerateSocialPostsOutputSchema },
    });

    if (!output) {
      return { success: false, error: 'No output from AI model' };
    }

    return { success: true, data: output };
  } catch (error: any) {
    console.error('[Social Posts] Error:', error.message);
    return { success: false, error: error.message || 'Unknown error during social post generation' };
  }
}
