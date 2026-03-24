import { escapeHtml } from './html-utils';
import { resolveOrgColors, getAttribution } from './brand-utils';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dmo-press-release.vercel.app';

type OrgLike = {
  name?: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
  } | null;
  tier?: string | null;
};

/**
 * Resolve email-safe inline colours from org branding.
 */
export function getEmailColors(org: OrgLike) {
  return resolveOrgColors(org.branding);
}

/**
 * Styled CTA button using org primary colour.
 */
export function emailButton(org: OrgLike, href: string, label: string): string {
  const { primary, textOnPrimary } = getEmailColors(org);
  return `<div style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:${primary};color:${textOnPrimary};text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">${label}</a>
  </div>`;
}

/**
 * Email header banner with org branding colour and optional logo.
 */
export function emailHeader(org: OrgLike, title: string): string {
  const { primary, textOnPrimary } = getEmailColors(org);
  const orgName = escapeHtml(org.name || '');
  const logoHtml = org.branding?.logoUrl
    ? `<img src="${org.branding.logoUrl}" alt="${orgName}" height="28" style="height:28px;width:auto;margin-bottom:8px;display:block;" />`
    : '';

  return `<div style="background:${primary};padding:24px 32px;border-radius:8px 8px 0 0;">
    ${logoHtml}
    <p style="margin:0;color:${textOnPrimary};opacity:0.8;font-size:13px;">${orgName}</p>
    <h1 style="margin:4px 0 0;color:${textOnPrimary};font-size:20px;">${title}</h1>
  </div>`;
}

/**
 * Email footer with tier-controlled PressPilot attribution.
 */
export function emailFooter(org: OrgLike, options?: { showManageLink?: boolean }): string {
  const orgName = escapeHtml(org.name || '');
  const attribution = getAttribution(org.tier);
  const manageLink = options?.showManageLink !== false
    ? ` &middot; <a href="${appUrl}/dashboard/settings" style="color:#94a3b8;">Manage notifications</a>`
    : '';

  let text: string;
  if (attribution === 'none') {
    text = `Sent by ${orgName}`;
  } else if (attribution === 'subtle') {
    text = `Sent by ${orgName} &middot; <span style="font-size:10px;opacity:0.7;">Powered by PressPilot</span>`;
  } else {
    text = `Sent by ${orgName} via PressPilot`;
  }

  return `<div style="text-align:center;padding:20px;font-size:12px;color:#94a3b8;">
    ${text}${manageLink}
  </div>`;
}

/**
 * Full email wrapper: header + body content + footer.
 * Drop-in replacement for the old emailWrapper() function.
 */
export function emailWrapper(org: OrgLike, headerTitle: string, body: string, options?: { showManageLink?: boolean }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  ${emailHeader(org, headerTitle)}
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:32px;border-radius:0 0 8px 8px;">
    ${body}
  </div>
  ${emailFooter(org, options)}
</body>
</html>`;
}

/**
 * Callout box using org branding (e.g. "Featured in" box in emails).
 */
export function emailCallout(org: OrgLike, content: string): string {
  const { primary, primaryLight } = getEmailColors(org);
  return `<div style="background:${primaryLight};border-left:4px solid ${primary};padding:16px;margin:24px 0;border-radius:0 8px 8px 0;">
    ${content}
  </div>`;
}

/**
 * Styled link using org primary colour.
 */
export function emailLink(org: OrgLike, href: string, text: string): string {
  const { primary } = getEmailColors(org);
  return `<a href="${href}" style="color:${primary};text-decoration:none;">${text}</a>`;
}

/**
 * Large metric number styled in org primary colour.
 */
export function emailMetric(org: OrgLike, value: string | number): string {
  const { primary } = getEmailColors(org);
  return `<div style="font-size:32px;font-weight:700;color:${primary};line-height:1;">${value}</div>`;
}

/**
 * Smaller inline metric.
 */
export function emailMetricSmall(org: OrgLike, value: string | number): string {
  const { primary } = getEmailColors(org);
  return `<div style="font-size:20px;font-weight:700;color:${primary};">${value}</div>`;
}
