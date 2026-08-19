'use server';

import {z} from 'genkit';

const SocialHandlesSchema = z.object({
  instagram: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
  linkedin: z.string().optional(),
  tiktok: z.string().optional(),
});

const SubmissionInputSchema = z.object({
  title: z.string(),
  bodyCopy: z.string(),
  partnerName: z.string(),
  tags: z.array(z.string()),
  aiThemes: z.array(z.string()).optional(),
  socialHandles: SocialHandlesSchema.optional(),
  /** Set only on submissions escalated up from a daughter org (federated tenants). */
  sourceOrgName: z.string().optional(),
});

const GenerateDraftInputSchema = z.object({
  submissions: z.array(SubmissionInputSchema).describe('Partner submissions to combine into a press release'),
  brandToneNotes: z.string().describe('Organization brand and tone guidelines'),
  targetMarket: z.string().optional().describe('Target market for the press release'),
  additionalInstructions: z.string().optional().describe('Extra instructions for the AI'),
  orgTypeDescription: z.string().optional().describe('Organisation type (e.g. "Destination Marketing Organization")'),
  contentDomain: z.string().optional().describe('Content domain (e.g. "tourism experiences")'),
  audienceOptions: z.array(z.string()).optional().describe('Valid audience options for the press release'),
  /** Org setting: whether a credit line should be appended when the draft includes escalated submissions. Defaults to true (on) when omitted, matching the Organization schema default. */
  showEscalationSourceCredit: z.boolean().optional(),
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

/**
 * Builds the "Additional reporting from X" credit line for submissions that were
 * escalated up from a daughter org, per the resolved showEscalationSourceCredit
 * decision in the federated-tenants build plan. Returns null when there's nothing
 * to credit, or when the org has explicitly switched the credit off.
 */
function buildEscalationCreditLine(
  submissions: z.infer<typeof SubmissionInputSchema>[],
  showEscalationSourceCredit: boolean | undefined
): string | null {
  if (showEscalationSourceCredit === false) return null;

  const sourceOrgNames: string[] = [];
  for (const s of submissions) {
    if (s.sourceOrgName && !sourceOrgNames.includes(s.sourceOrgName)) {
      sourceOrgNames.push(s.sourceOrgName);
    }
  }
  if (sourceOrgNames.length === 0) return null;

  const names =
    sourceOrgNames.length === 1
      ? sourceOrgNames[0]
      : `${sourceOrgNames.slice(0, -1).join(', ')} and ${sourceOrgNames[sourceOrgNames.length - 1]}`;

  return `Additional reporting from ${names}.`;
}

export async function generateDraftFromSubmissions(
  input: GenerateDraftInput
): Promise<GenerateDraftResult> {
  try {
    const {ai} = await import('@/ai/genkit');

    const submissionsText = input.submissions
      .map((s, i) => {
        const handles = s.socialHandles
          ? Object.entries(s.socialHandles)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : '';
        return `--- Submission ${i + 1} (from ${s.partnerName}) ---
Title: ${s.title}
Tags: ${s.tags.join(', ')}
Themes: ${s.aiThemes?.join(', ') || 'Not analyzed'}${handles ? `\nSocial: ${handles}` : ''}
Content:
${s.bodyCopy}`;
      })
      .join('\n\n');

    const {output} = await ai.generate({
      prompt: `You are an expert PR writer for a ${input.orgTypeDescription ?? 'Destination Marketing Organization'}. Given the following partner submissions about ${input.contentDomain ?? 'tourism experiences'}, generate a professional press release draft that weaves them into a cohesive narrative organized by theme.

Brand Tone: ${input.brandToneNotes}
Target Market: ${input.targetMarket || 'General'}
Additional Instructions: ${input.additionalInstructions || 'None'}

Partner Submissions:
${submissionsText}

Generate a press release with:
1. A compelling headline
2. Professional body copy that combines the submissions into a cohesive story
3. A suggested campaign type (Seasonal, Product Launch, Event, Partnership, Award, or General)
4. A suggested audience (${(input.audienceOptions ?? ['Travel Trade', 'Consumer', 'Hybrid']).join(', ')})

The body copy should be well-structured with paragraphs, quotes where appropriate, and a professional journalistic tone.`,
      output: {schema: GenerateDraftOutputSchema},
    });

    if (!output) {
      return {success: false, error: 'No output from AI model'};
    }

    // Append a credit line for any escalated submissions, deterministically rather than
    // relying on the AI to remember to include it. Skipped entirely when the org has
    // switched showEscalationSourceCredit off (explicit false) - defaults to on.
    const creditLine = buildEscalationCreditLine(input.submissions, input.showEscalationSourceCredit);
    const bodyCopy = creditLine ? `${output.bodyCopy}\n\n${creditLine}` : output.bodyCopy;

    return {success: true, data: {...output, bodyCopy}};
  } catch (error: any) {
    console.error('[Generate Draft] Error:', error.message);
    return {success: false, error: error.message || 'Unknown error during draft generation'};
  }
}
