import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { tierHasFeature } from './tiers';

/**
 * Media Opportunities is included on Professional, Organisation and Enterprise
 * (functions/src/tiers.ts), but generation also requires
 * orgs/{orgId}/mediaOpportunitySettings/config.enabled === true. Nothing in the
 * signup / upgrade / provisioning paths used to create that doc, so eligible orgs
 * landed on an inactive screen that called the feature a paid add-on.
 *
 * This helper is called from every org lifecycle path (createOrgWithTrial,
 * syncSubscription, provisionNewOrg, updateOrgLimits, createChildOrg). It:
 *   - does nothing when the tier does not include mediaOpportunities (downgrades keep
 *     saved watch settings intact; runGeneration already skips non-entitled tiers);
 *   - respects adminDisabledOverride === true (Press Pilot deliberately paused it) and
 *     pausedByOrgAdmin === true (the org's own Admin switched it off);
 *   - otherwise merges enabled: true, preserving priorityTopics, priorityGeographies,
 *     watchlistTerms and mutedTopics.
 *
 * Deliberately non-fatal: a failure here must never roll back or fail org
 * provisioning or a Stripe webhook. It logs and returns false instead.
 */
export async function ensureMediaOpportunitiesDefault(
  orgId: string,
  tier: string | null | undefined
): Promise<boolean> {
  if (!orgId || !tierHasFeature(tier, 'mediaOpportunities')) return false;
  try {
    const ref = admin
      .firestore()
      .collection('orgs')
      .doc(orgId)
      .collection('mediaOpportunitySettings')
      .doc('config');

    return await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.data() as Record<string, unknown> | undefined;
      if (existing?.adminDisabledOverride === true) return false;
      if (existing?.enabled === true) return false;
      // An org Admin deliberately switched it off from the settings card. Stripe webhooks
      // fire syncSubscription often, so without this an org could never keep it paused.
      if (existing?.pausedByOrgAdmin === true) return false;

      const base: Record<string, unknown> = {
        orgId,
        enabled: true,
        autoEnabledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Only seed empty arrays on a brand-new doc so we never wipe saved settings.
      if (!snap.exists) {
        base.priorityTopics = [];
        base.priorityGeographies = [];
        base.watchlistTerms = [];
        base.mutedTopics = [];
      }
      tx.set(ref, base, { merge: true });
      return true;
    });
  } catch (err) {
    console.error(`[ensureMediaOpportunitiesDefault] ${orgId} (tier=${tier}) failed:`, err);
    return false;
  }
}

/**
 * QW-04 — one-off audit and backfill for existing Professional+ orgs.
 *
 * Super Admin only. Defaults to a dry run that changes nothing and returns which
 * eligible orgs are missing mediaOpportunitySettings/config or have enabled !== true.
 * Call again with { dryRun: false } to backfill. Demo orgs (isDemo === true), orgs with
 * adminDisabledOverride and orgs whose Admin deliberately paused it are reported but skipped.
 */
export const auditMediaOpportunitiesDefaults = functions
  .runWith({ timeoutSeconds: 300 })
  .https.onCall(async (data, context) => {
    if (!context.auth?.token?.superAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Super Admin only.');
    }
    const dryRun = data?.dryRun !== false;
    const db = admin.firestore();
    const orgs = await db.collection('orgs').get();

    type Row = { orgId: string; name: string; tier: string; state: string; action: string };
    const rows: Row[] = [];

    for (const org of orgs.docs) {
      const tier = org.get('tier') as string | undefined;
      if (!tierHasFeature(tier, 'mediaOpportunities')) continue;

      const cfg = (await org.ref.collection('mediaOpportunitySettings').doc('config').get()).data();
      const state = !cfg ? 'missing' : cfg.enabled === true ? 'enabled' : 'disabled';
      if (state === 'enabled') continue;

      let action = 'would_enable';
      if (org.get('isDemo') === true) action = 'skipped_demo';
      else if (cfg?.adminDisabledOverride === true) action = 'skipped_admin_override';
      else if (cfg?.pausedByOrgAdmin === true) action = 'skipped_org_admin_paused';
      else if (!dryRun) action = (await ensureMediaOpportunitiesDefault(org.id, tier)) ? 'enabled' : 'failed';

      rows.push({ orgId: org.id, name: (org.get('name') as string) || org.id, tier: tier || '', state, action });
    }

    console.log(`[auditMediaOpportunitiesDefaults] dryRun=${dryRun} rows=${rows.length}`, rows);
    return { dryRun, count: rows.length, orgs: rows };
  });
