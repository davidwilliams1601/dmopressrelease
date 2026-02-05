'use server';

/**
 * @fileOverview This file defines a Genkit flow for providing campaign effectiveness insights.
 *
 * The flow takes in engagement statistics and organization brand/tone notes to generate insights
 * on how well the campaign aligned with the target audience. It exports a function,
 * provideCampaignEffectivenessInsights, which wraps the flow.
 *
 * @interface ProvideCampaignEffectivenessInsightsInput - Input for the campaign effectiveness insights flow.
 * @interface ProvideCampaignEffectivenessInsightsOutput - Output of the campaign effectiveness insights flow.
 * @function provideCampaignEffectivenessInsights - A function that calls the campaign effectiveness insights flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProvideCampaignEffectivenessInsightsInputSchema = z.object({
  numReleases: z.number().describe('The number of press releases in the campaign.'),
  numSends: z.number().describe('The number of emails sent for the campaign.'),
  opens: z.number().describe('The number of email opens for the campaign.'),
  clicks: z.number().describe('The number of link clicks in the emails for the campaign.'),
  pageViews: z.number().describe('The number of press page views for the campaign.'),
  brandToneNotes: z.string().describe('The brand and tone notes for the organization.'),
});
export type ProvideCampaignEffectivenessInsightsInput = z.infer<typeof ProvideCampaignEffectivenessInsightsInputSchema>;

const ProvideCampaignEffectivenessInsightsOutputSchema = z.object({
  insights: z.string().describe('Insights on the campaign effectiveness based on engagement stats and brand/tone notes.'),
});
export type ProvideCampaignEffectivenessInsightsOutput = z.infer<typeof ProvideCampaignEffectivenessInsightsOutputSchema>;

export async function provideCampaignEffectivenessInsights(
  input: ProvideCampaignEffectivenessInsightsInput
): Promise<ProvideCampaignEffectivenessInsightsOutput> {
  return provideCampaignEffectivenessInsightsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'provideCampaignEffectivenessInsightsPrompt',
  input: {schema: ProvideCampaignEffectivenessInsightsInputSchema},
  output: {schema: ProvideCampaignEffectivenessInsightsOutputSchema},
  prompt: `You are an expert marketing analyst providing insights on campaign effectiveness.

  Based on the following engagement statistics and brand/tone notes, provide insights on how well the campaign aligned with the target audience.

  Engagement Statistics:
  - Number of Releases: {{{numReleases}}}
  - Number of Sends: {{{numSends}}}
  - Opens: {{{opens}}}
  - Clicks: {{{clicks}}}
  - Page Views: {{{pageViews}}}

  Brand/Tone Notes:
  {{{brandToneNotes}}}
  `,
});

const provideCampaignEffectivenessInsightsFlow = ai.defineFlow(
  {
    name: 'provideCampaignEffectivenessInsightsFlow',
    inputSchema: ProvideCampaignEffectivenessInsightsInputSchema,
    outputSchema: ProvideCampaignEffectivenessInsightsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
