'use server';

/**
 * @fileOverview This file defines a server action for providing campaign effectiveness insights.
 */

import {z} from 'genkit';

const ProvideCampaignEffectivenessInsightsInputSchema = z.object({
  numReleases: z.number().describe('The number of press releases in the campaign.'),
  numSends: z.number().describe('The number of emails sent for the campaign.'),
  opens: z.number().describe('The number of email opens for the campaign.'),
  clicks: z.number().describe('The number of link clicks in the emails for the campaign.'),
  pageViews: z.number().describe('The number of press page views for the campaign.'),
  orgName: z.string().describe('The name of the organisation the stats belong to.'),
  brandToneNotes: z.string().describe('The brand and tone notes for the organization.'),
});
export type ProvideCampaignEffectivenessInsightsInput = z.infer<typeof ProvideCampaignEffectivenessInsightsInputSchema>;

const ProvideCampaignEffectivenessInsightsOutputSchema = z.object({
  insights: z.string().describe('Insights on the campaign effectiveness based on engagement stats and brand/tone notes.'),
});
export type ProvideCampaignEffectivenessInsightsOutput = z.infer<typeof ProvideCampaignEffectivenessInsightsOutputSchema>;

type InsightsResult =
  | { success: true; data: ProvideCampaignEffectivenessInsightsOutput }
  | { success: false; error: string };

export async function provideCampaignEffectivenessInsights(
  input: ProvideCampaignEffectivenessInsightsInput
): Promise<InsightsResult> {
  try {
    const {ai} = await import('@/ai/genkit');

    const {output} = await ai.generate({
      prompt: `You are an expert marketing analyst providing insights on campaign effectiveness.

  The organisation is ${input.orgName || 'the user\'s organisation'}. Based on the following engagement statistics and brand/tone notes, provide insights on how well its campaigns aligned with the target audience. Only refer to this organisation, and do not invent places, partners or campaigns that are not given here.

  Engagement Statistics:
  - Number of Releases: ${input.numReleases}
  - Number of Sends: ${input.numSends}
  - Opens: ${input.opens}
  - Clicks: ${input.clicks}
  - Page Views: ${input.pageViews}

  Brand/Tone Notes:
  ${input.brandToneNotes || 'None provided.'}`,
      output: {schema: ProvideCampaignEffectivenessInsightsOutputSchema},
    });

    return { success: true, data: output! };
  } catch (error: any) {
    console.error('[AI Insights] Error:', error.message);
    console.error('[AI Insights] Stack:', error.stack);
    console.error('[AI Insights] GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
