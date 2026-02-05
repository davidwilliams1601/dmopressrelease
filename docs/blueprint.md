# **App Name**: PressPilot

## Core Features:

- Authentication: Secure user authentication via Firebase Auth with email/password.
- Organization Settings: Admin interface for managing organization details (name, boilerplate text, press contact details, brand/tone notes).
- Press Release Builder: Create, edit, and save press releases with fields for campaign type, target market, audience, headline, standfirst, body copy, quote, and CTA. The tone of the copy is improved using generative AI with the Org settings as a tool.
- Public Press Page: Publish press releases to a public URL with the structure /press/[orgSlug]/[releaseSlug].
- Asset Uploads: Upload and associate images with press releases using Firebase Storage.
- Outlet Lists: Create and manage outlet lists by uploading recipients via CSV (outlet name, email, market).
- Email Syndication: Send press releases via Resend, including a subject line, short intro, and a link to the press page. Support for 'send test email to myself'.
- Engagement Tracking: Track email opens, email link clicks, and press page views, storing events in Firestore.
- Reporting Dashboard: Display a simple dashboard with tables and counts for the number of releases, sends, opens, clicks, and page views. This will include insights about campaign effectiveness derived by comparing engagement stats with Org brand/tone notes.

## Style Guidelines:

- Primary color: A muted blue (#6699CC) to convey trust and professionalism, aligning with the B2B nature of the product.
- Background color: Light gray (#F0F0F0) to provide a clean, neutral backdrop for content.
- Accent color: Soft orange (#E59866) for calls to action and highlights, adding warmth without overwhelming the user.
- Headline font: 'Space Grotesk' (sans-serif) for a modern, professional headline style; body font: 'Inter' (sans-serif) for readability in longer text blocks.
- Use clean, line-based icons from a set like 'Phosphor Icons' for a consistent, modern look.
- Implement a clean, grid-based layout with ample whitespace for readability and a professional feel.
- Subtle animations, like fade-in effects on content load, to enhance user experience without being distracting.