/**
 * Central AI model configuration for Cloud Functions.
 * Keep the Gemini model id here so a deprecation/upgrade is a one-line change
 * rather than a hunt across multiple call sites.
 * (The Next.js/Genkit side has its own equivalent in src/ai/genkit.ts.)
 */
export const GEMINI_MODEL = 'gemini-2.5-flash';
