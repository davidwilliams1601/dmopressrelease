import { escapeHtml } from './html-utils';
import { resolveOrgColors } from './brand-utils';
import { emailFooter } from './email-branding';
import { hasPressContact, notesToEditorsText, pressContactParts, shouldRenderEnds, telHref } from './release-sections';

/**
 * The journalist-facing release email (HTML + plain text).
 *
 * Lives in its own module, with no firebase-admin/functions imports, so
 * functions/src/__tests__/format-email.test.ts can render it under plain Node
 * and pin the section order and the "no notes, no contact => unchanged" contract.
 */

/**
 * Convert bare http/https URLs in already-escaped HTML text into clickable anchor tags.
 * Must be called AFTER escapeHtml so that & in query strings is already &amp; (valid in href).
 */
export function linkifyHtml(escapedText: string, linkColor?: string): string {
  const color = linkColor || '#2563eb';
  return escapedText.replace(
    /https?:\/\/[^\s<>"']+/g,
    (url) => `<a href="${url}" style="color: ${color};">${url}</a>`
  );
}

// Validate that a URL is safe for use in email templates
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Plain-text alternative for the journalist email. Mirrors the HTML section order
 * so text-only clients (and SendGrid's spam scoring, which compares the two parts)
 * see the same release. Exported for tests.
 */
export function formatEmailText(release: any, org?: any): string {
  const parts: string[] = [release.bodyCopy || 'No content'];
  if (shouldRenderEnds(release)) parts.push('ENDS');
  const notes = notesToEditorsText(release);
  if (notes) parts.push(`Notes to editors\n${notes}`);
  if (org?.boilerplate) parts.push(`About ${org.name || ''}\n${org.boilerplate}`);
  if (hasPressContact(org?.pressContact)) {
    const c = pressContactParts(org?.pressContact);
    parts.push(['Media contact', c.name, c.email, c.phone].filter(Boolean).join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * Format release content as HTML email.
 *
 * Section order after the story is fixed and mirrored on the public release page:
 *   body → video → ENDS → Notes to editors → About {org} → Media contact → footer.
 * ENDS appears only when notes exist, so a release with no notes and no contact
 * renders exactly as before. Exported for functions/src/__tests__/format-email.test.ts.
 */
export function formatEmailHtml(release: any, recipient: any, org?: any): string {
  const colors = resolveOrgColors(org?.branding);
  const headline = escapeHtml(release.headline || '');
  const bodyCopy = linkifyHtml(escapeHtml(release.bodyCopy || ''), colors.primary);
  const recipientName = escapeHtml(recipient.name || '');
  const recipientEmail = escapeHtml(recipient.email || '');
  const recipientOutlet = escapeHtml(recipient.outlet || '');
  const orgName = escapeHtml(org?.name || '');
  const boilerplate = escapeHtml(org?.boilerplate || '');
  const logoHtml = org?.branding?.logoUrl
    ? `<img src="${org.branding.logoUrl}" alt="${orgName}" height="32" style="height:32px;width:auto;margin-bottom:12px;display:block;" />`
    : '';

  // Only include image if URL is valid
  const imageHtml = (release.imageUrl && isValidUrl(release.imageUrl))
    ? `<div style="margin-bottom: 20px;">
        <img src="${escapeHtml(release.imageUrl)}" alt="${headline}"
             style="max-width: 100%; height: auto; border-radius: 8px; display: block;" />
      </div>`
    : '';

  // Video is a LINK, never an embed. No mainstream email client plays inline video —
  // Gmail and Outlook strip <video> entirely, so an embed renders as a blank gap.
  // A journalist also wants the file itself to cut into their own package, not a
  // player. So we give them a labelled download link with the duration up front,
  // which is what a broadcast newsdesk actually acts on.
  const videoDurationLabel = release.videoMetadata?.durationSeconds
    ? `${Math.round(release.videoMetadata.durationSeconds)} seconds`
    : '';
  const videoSizeLabel = release.videoMetadata?.size
    ? `${Math.max(1, Math.round(release.videoMetadata.size / (1024 * 1024)))}MB`
    : '';
  const videoDetail = [videoDurationLabel, videoSizeLabel, 'MP4']
    .filter(Boolean)
    .join(' · ');

  const videoHtml = (release.videoUrl && isValidUrl(release.videoUrl))
    ? `<div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-left: 3px solid ${colors.primary}; border-radius: 6px; background-color: #fafafa;">
        <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #1a1a1a;">Video available</p>
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #666;">${escapeHtml(videoDetail)}</p>
        <a href="${escapeHtml(release.videoUrl)}"
           style="color: ${colors.primary}; font-size: 14px; font-weight: bold; text-decoration: underline;">
          Download the video
        </a>
      </div>`
    : '';

  // Notes to editors: same escape + linkify treatment as the body so a URL to a
  // data source or About page is clickable. "ENDS" is the print-era marker that
  // tells a journalist the story is over and background follows.
  const notes = notesToEditorsText(release);
  const notesHtml = notes
    ? `<div style="border-top: 2px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 14px; color: #666;">
          <strong>Notes to editors</strong>
          <div style="white-space: pre-wrap; margin-top: 8px;">${linkifyHtml(escapeHtml(notes), colors.primary)}</div>
        </div>`
    : '';
  const endsHtml = shouldRenderEnds(release)
    ? `<p style="margin: 24px 0 0 0; text-align: center; font-weight: bold; letter-spacing: 0.2em; color: #666;">ENDS</p>`
    : '';

  // Media contact: the same org.pressContact that sender.ts uses for Reply-To, so
  // the address journalists see matches where their replies land. Blank fields are
  // skipped individually; a wholly blank contact (child-org default) renders nothing.
  const contact = pressContactParts(org?.pressContact);
  const contactLines: string[] = [];
  if (contact.name) contactLines.push(escapeHtml(contact.name));
  if (contact.email) {
    const e = escapeHtml(contact.email);
    contactLines.push(`<a href="mailto:${e}" style="color: ${colors.primary};">${e}</a>`);
  }
  if (contact.phone) {
    contactLines.push(`<a href="${escapeHtml(telHref(contact.phone))}" style="color: ${colors.primary};">${escapeHtml(contact.phone)}</a>`);
  }
  const contactHtml = hasPressContact(org?.pressContact)
    ? `<div style="border-top: 2px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 14px; color: #666;">
          <strong>Media contact</strong><br>
          ${contactLines.join('<br>\n          ')}
        </div>`
    : '';

  const orgLike = { name: org?.name, branding: org?.branding, tier: org?.tier };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${headline}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${colors.primaryLight}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        ${logoHtml}
        <h1 style="margin: 0; color: #1a1a1a; font-size: 24px;">${headline}</h1>
      </div>

      <div style="background-color: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
        ${imageHtml}

        <div style="white-space: pre-wrap; margin-bottom: 20px;">
          ${bodyCopy}
        </div>

        ${videoHtml}

        ${endsHtml}

        ${notesHtml}

        ${boilerplate ? `
          <div style="border-top: 2px solid #e5e7eb; padding-top: 20px; margin-top: 20px; font-size: 14px; color: #666;">
            <strong>About ${orgName}:</strong><br>
            ${boilerplate}
          </div>
        ` : ''}

        ${contactHtml}
      </div>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; text-align: center;">
        <p>This email was sent to ${recipientName} (${recipientEmail}) at ${recipientOutlet}.</p>
        <p>If you no longer wish to receive these emails, please contact us.</p>
      </div>
      ${emailFooter(orgLike, { showManageLink: false })}
    </body>
    </html>
  `;
}
