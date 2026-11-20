/**
 * Unique engagement for display. Mirrors functions/src/unique-engagement-core.ts.
 *
 * Each recipient counts once towards opens and clicks, so open rates can't pass 100%.
 * `opens` / `clicks` on a release still hold every event (repeat opens included).
 * Releases from before unique counting (not yet backfilled) fall back to total opens,
 * capped at the number sent.
 */
export function uniqueOpensOf(x: { opens?: number; sends?: number; uniqueOpens?: number }): number {
  if (typeof x.uniqueOpens === 'number') return x.uniqueOpens;
  const opens = x.opens || 0;
  return typeof x.sends === 'number' ? Math.min(opens, x.sends) : opens;
}

export function uniqueClicksOf(x: { opens?: number; clicks?: number; sends?: number; uniqueOpens?: number; uniqueClicks?: number }): number {
  if (typeof x.uniqueClicks === 'number') return x.uniqueClicks;
  return Math.min(x.clicks || 0, uniqueOpensOf(x));
}
