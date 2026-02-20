'use server';

import {z} from 'genkit';

const SubmissionInputSchema = z.object({
  title: z.string(),
  bodyCopy: z.string(),
  partnerName: z.string(),
  tags: z.array(z.string()),
  aiThemes: z.array(z.string()).optional(),
});

const GenerateWebContentInputSchema = z.object({
  submissions: z.array(SubmissionInputSchema).describe('Partner submissions to combine into web content'),
  brandToneNotes: z.string().describe('Organization brand and tone guidelines'),
  contentType: z.string().optional().describe('Target content type for the web page section'),
  targetMarket: z.string().optional().describe('Target market for the web content'),
  additionalInstructions: z.string().optional().describe('Extra instructions for the AI'),
});

export type GenerateWebContentInput = z.infer<typeof GenerateWebContentInputSchema>;

const GenerateWebContentOutputSchema = z.object({
  title: z.string().describe('Page/section H1 title'),
  metaDescription: z.string().describe('SEO meta description, 150-160 characters'),
  introParagraph: z.string().describe('Opening paragraph for the web section'),
  sections: z.array(
    z.object({
      heading: z.string().describe('Section H2 heading'),
      body: z.string().describe('Section body copy'),
    })
  ).describe('Content sections with headings and body copy'),
  suggestedContentType: z.string().describe('Suggested content type: "What\'s New" | "Event Listing" | "Destination Guide" | "Seasonal Update" | "General"'),
});

export type GenerateWebContentOutput = z.infer<typeof GenerateWebContentOutputSchema>;

type GenerateWebContentResult =
  | { success: true; data: GenerateWebContentOutput }
  | { success: false; error: string };

export async function generateWebContentFromSubmissions(
  input: GenerateWebContentInput
): Promise<GenerateWebContentResult> {
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
      prompt: `You are an expert digital content writer for a Destination Marketing Organization. Given the following partner submissions, generate structured, web-optimised content for the DMO's website.

Brand Tone: ${input.brandToneNotes}
Content Type: ${input.contentType || 'General'}
Target Market: ${input.targetMarket || 'General'}
Additional Instructions: ${input.additionalInstructions || 'None'}

Partner Submissions:
${submissionsText}

Generate web content with:
1. A compelling, SEO-friendly H1 title
2. A meta description of exactly 150-160 characters for SEO
3. An engaging opening paragraph (2-4 sentences)
4. 2-4 scannable sections with H2 headings and concise body copy

Writing style guidelines:
- Use short paragraphs and scannable headings (not journalistic press release prose)
- Action-oriented, visitor-focused language
- Active voice throughout
- Keep section body copy to 2-4 sentences each
- Suggest the most appropriate content type from: "What's New", "Event Listing", "Destination Guide", "Seasonal Update", "General"`,
      output: {schema: GenerateWebContentOutputSchema},
    });

    if (!output) {
      return {success: false, error: 'No output from AI model'};
    }

    return {success: true, data: output};
  } catch (error: any) {
    console.error('[Generate Web Content] Error:', error.message);
    return {success: false, error: error.message || 'Unknown error during web content generation'};
  }
}
