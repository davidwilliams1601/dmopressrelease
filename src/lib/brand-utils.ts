export const DEFAULT_PRIMARY = '#2563eb';
export const DEFAULT_PRIMARY_LIGHT = '#eff6ff';
export const DEFAULT_SECONDARY = '#1e40af';

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/**
 * Lighten a hex colour by mixing with white.
 * amount: 0 = unchanged, 1 = white
 */
export function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_PRIMARY_LIGHT;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount
  );
}

/**
 * Darken a hex colour by mixing with black.
 * amount: 0 = unchanged, 1 = black
 */
export function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r * (1 - amount), rgb.g * (1 - amount), rgb.b * (1 - amount));
}

export function isValidHex(value: string): boolean {
  return /^#([a-fA-F0-9]{6})$/.test(value);
}

/**
 * Returns white or black text depending on background luminance.
 */
export function getContrastColor(hex: string): '#ffffff' | '#000000' {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  // W3C relative luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export type ResolvedBrandColors = {
  primary: string;
  primaryLight: string;
  secondary: string;
};

export function resolveOrgColors(branding?: { primaryColor?: string; secondaryColor?: string } | null): ResolvedBrandColors {
  const primary = branding?.primaryColor && isValidHex(branding.primaryColor) ? branding.primaryColor : DEFAULT_PRIMARY;
  const secondary = branding?.secondaryColor && isValidHex(branding.secondaryColor) ? branding.secondaryColor : darkenHex(primary, 0.2);
  const primaryLight = lightenHex(primary, 0.92);
  return { primary, primaryLight, secondary };
}

export type AttributionLevel = 'full' | 'subtle' | 'none';

export function getAttribution(tier?: string | null): AttributionLevel {
  if (tier === 'organisation') return 'none';
  if (tier === 'professional') return 'subtle';
  return 'full';
}
