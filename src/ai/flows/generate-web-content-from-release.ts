'use server';

import {z} from 'genkit';

const GenerateWebContentFromReleaseInputSchema = z.object({
  headline: z.string().describe('Press release headline'),
  bodyCopy: z.string().describe('Press release body copy'),
  brandToneNotes: z.string().describe('Organization brand and tone guidelines'),
  contentType: z.string().optional(),
  targetMarket: z.string().optional(),
  additionalInstructions: z.string().optional(),
  orgTypeDescription: z.string().optional(),
  webContentStyle: z.string().optional(),
  suggestedContentTypeInstruction: z.string().optional(),
});

export type GenerateWebContentFromReleaseInput = z.infer<typeof GenerateWebContentFromReleaseInputSchema>;

const GenerateWebContentFromReleaseOutputSchema = z.object({
  title: z.string().describe('Page/section H1 title'),
  metaDescription: z.string().describe('SEO meta description, 150-160 characters'),
  introParagraph: z.string().describe('Opening paragraph for the web section'),
  sections: z.array(
    z.object({
      heading: z.string().describe('Section H2 heading'),
      body: z.string().describe('Section body copy'),
    })
  ).describe('Content sections with headings and body copy'),
  suggestedContentType: z.string().describe('Suggested content type'),
});

export type GenerateWebContentFromReleaseOutput = z.infer<typeof GenerateWebContentFromReleaseOutputSchema>;

type Result =
  | { success: true; data: GenerateWebContentFromReleaseOutput }
  | { success: false; error: string };

export async function generateWebContentFromRelease(
  input: GenerateWebContentFromReleaseInput
): Promise<Result> {
  try {
    const {ai} = await import('@/ai/genkit');

    const {output} = await ai.generate({
      prompt: `You are an expert digital content writer for a ${input.orgTypeDescription ?? 'Destination Marketing Organization'}. Given the following press release, generate structured, web-optimised content for the organisation's website.

Brand Tone: ${input.brandToneNotes}
Content Type: ${input.contentType || 'General'}
Target Market: ${input.targetMarket || 'General'}
Additional Instructions: ${input.additionalInstructions || 'None'}

Press Release:
Headline: ${input.headline}

${input.bodyCopy}

Generate web content with:
1. A compelling, SEO-friendly H1 title (can differ from the press release headline — optimise for web search)
2. A meta description of exactly 150-160 characters for SEO
3. An engaging opening paragraph (2-4 sentences)
4. 2-4 scannable sections with H2 headings and concise body copy

Writing style guidelines:
- Adapt from press release prose to web/visitor-facing copy
- Use short paragraphs and scannable headings
- ${input.webContentStyle ?? 'Action-oriented, visitor-focused language'}
- Active voice throughout
- Keep section body copy to 2-4 sentences each
- ${input.suggestedContentTypeInstruction ?? 'Suggest the most appropriate content type from: "What\'s New", "Event Listing", "Destination Guide", "Seasonal Update", "General"'}`,
      output: {schema: GenerateWebContentFromReleaseOutputSchema},
    });

    if (!output) {
      return {success: false, error: 'No output from AI model'};
    }

    return {success: true, data: output};
  } catch (error: any) {
    console.error('[Generate Web Content From Release] Error:', error.message);
    return {success: false, error: error.message || 'Unknown error during web content generation'};
  }
}
