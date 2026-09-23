/**
 * Media Opportunities — the intelligence-layer MVP.
 *
 * Three jobs, in strict order, each independently inspectable:
 *
 *   1. `ingestMediaSources`        — read curated RSS/Atom feeds, normalise and store items
 *   2. `generateMediaOpportunities`— cluster items into themes, test momentum, match orgs
 *   3. the callables below         — superadmin registry management, org settings, feedback
 *
 * Design constraints this file exists to honour (see docs/media-opportunities-mvp.md):
 *
 *   - Read-only. Nothing here contacts anybody. There is deliberately no code path from
 *     an opportunity to a Smart Distribution send; that connection waits until the
 *     Smart Distribution privacy/credit/webhook hardening is finished.
 *   - Evidence or nothing. An opportunity that cannot cite at least two real items from
 *     two distinct sources is never written.
 *   - Deterministic facts and interpretation are stored in separate fields. Counts,
 *     dates, distinct-source totals and matched tags are computed in code here. The
 *     summary/rationale strings are assembled from those same facts by template — this
 *     slice deliberately calls no model, so there is nothing that can hallucinate a
 *     source. Model-written narrative is a later slice and will sit on top of these
 *     stored facts, never in place of them.
 *   - Tenant isolation. Platform items are shared; every match, decision and piece of
 *     feedback lives under /orgs/{orgId}/ and never leaves it.
 *   - Only feed-supplied summaries are stored, truncated. Never full article text.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import {
  DEVELOPING_WINDOW_DAYS,
  FEED_TIMEOUT_MS,
  GENERATOR_VERSION,
  MAX_CONSECUTIVE_FAILURES,
  MAX_ITEM_AGE_DAYS,
  MAX_OPPORTUNITIES_PER_RUN,
  MIN_SOURCES_DEVELOPING,
  MIN_SOURCES_EMERGING,
  OPPORTUNITY_TTL_DAYS,
  SEED_SOURCES,
  USER_AGENT,
} from './media-opportunity-config';
import {
  WorkingItem,
  assessMomentum,
  canonicaliseUrl,
  chooseAction,
  containsTerm,
  mediaItemDocId,
  parseFeed,
  tagItem,
} from './media-opportunity-engine';

const db = admin.firestore();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Checks that the caller has the superAdmin custom claim.
 * Duplicated from super-admin.ts's requireSuperAdmin — the established pattern in this
 * codebase (see media-network.ts, media-taxonomy.ts, credits.ts).
 */
function requireSuperAdmin(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (!context.auth.token?.superAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Super-admin access required.');
  }
}

/** Resolves the caller to a team member (Admin/User) of `orgId`, or a superadmin. */
async function requireTeamMember(
  context: functions.https.CallableContext,
  orgId: string
): Promise<{ uid: string; name?: string; isSuperAdmin: boolean }> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const isSuperAdmin = !!context.auth.token?.superAdmin;
  if (isSuperAdmin) {
    return { uid: context.auth.uid, isSuperAdmin: true };
  }
  const userSnap = await db.collection('orgs').doc(orgId).collection('users').doc(context.auth.uid).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'You are not a member of this organisation.');
  }
  const role = userSnap.data()?.role;
  if (role !== 'Admin' && role !== 'User') {
    throw new functions.https.HttpsError('permission-denied', 'Team-member access required.');
  }
  return { uid: context.auth.uid, name: userSnap.data()?.name, isSuperAdmin: false };
}

// ---------------------------------------------------------------------------
// Slice 1 — ingestion
// ---------------------------------------------------------------------------

type IngestSummary = {
  sourcesChecked: number;
  sourcesFailed: number;
  itemsSeen: number;
  itemsCreated: number;
  itemsSkippedSensitive: number;
};

async function fetchFeed(feedUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads every enabled source once and stores new items.
 *
 * Idempotent by construction: the document ID is a hash of the canonical URL, so an
 * overlapping feed window, a manual re-run and a retry after a partial failure all
 * converge on the same one document per article. Existing items are never overwritten —
 * a publisher silently editing a headline must not rewrite evidence a customer was
 * already shown.
 */
async function runIngestion(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    sourcesChecked: 0,
    sourcesFailed: 0,
    itemsSeen: 0,
    itemsCreated: 0,
    itemsSkippedSensitive: 0,
  };

  const sourcesSnap = await db.collection('mediaSources').where('enabled', '==', true).get();
  const cutoff = Date.now() - MAX_ITEM_AGE_DAYS * DAY_MS;

  for (const sourceDoc of sourcesSnap.docs) {
    const source = sourceDoc.data() as any;
    summary.sourcesChecked += 1;

    let xml: string;
    try {
      xml = await fetchFeed(source.feedUrl);
    } catch (err: any) {
      summary.sourcesFailed += 1;
      const failures = (source.consecutiveFailures || 0) + 1;
      await sourceDoc.ref.update({
        lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
        consecutiveFailures: failures,
        lastError: String(err?.message || err).slice(0, 300),
        // Quarantine, never delete: the registry should keep a record of what broke.
        ...(failures >= MAX_CONSECUTIVE_FAILURES ? { enabled: false } : {}),
      });
      console.warn(`[media-opportunities] Feed failed: ${source.name} — ${err?.message || err}`);
      continue;
    }

    let entries: ReturnType<typeof parseFeed> = [];
    try {
      entries = parseFeed(xml);
    } catch (err: any) {
      summary.sourcesFailed += 1;
      await sourceDoc.ref.update({
        lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
        consecutiveFailures: (source.consecutiveFailures || 0) + 1,
        lastError: `Parse failed: ${String(err?.message || err).slice(0, 200)}`,
      });
      continue;
    }

    const fresh = entries.filter((e) => {
      // A feed with no date at all is treated as "now": some official feeds omit dates,
      // and dropping them entirely would lose exactly the government/sector sources the
      // MVP is meant to lean on. A wrong date only ever makes an item look newer, which
      // the momentum window then has to justify against other sources anyway.
      const t = e.publishedAt ? e.publishedAt.getTime() : Date.now();
      return t >= cutoff;
    });

    summary.itemsSeen += fresh.length;

    // One batched read to find out which of these we already hold, then create only
    // the genuinely new ones. Chunked because getAll and batches are both bounded.
    for (let i = 0; i < fresh.length; i += 100) {
      const chunk = fresh.slice(i, i + 100);
      const refs = chunk.map((e) => db.collection('mediaItems').doc(mediaItemDocId(e.url)));
      const existing = await db.getAll(...refs);
      const batch = db.batch();
      let writes = 0;

      chunk.forEach((entry, idx) => {
        if (existing[idx].exists) return;
        const tagged = tagItem({
          title: entry.title,
          summary: entry.summary,
          sourceGeographies: source.geographies || [],
          sourceDefaultTopics: source.defaultTopics || [],
        });
        if (tagged.sensitive) summary.itemsSkippedSensitive += 1;

        batch.set(refs[idx], {
          sourceId: sourceDoc.id,
          sourceName: source.name,
          title: entry.title,
          url: canonicaliseUrl(entry.url),
          ...(entry.summary ? { summary: entry.summary } : {}),
          ...(entry.author ? { author: entry.author } : {}),
          publishedAt: entry.publishedAt
            ? admin.firestore.Timestamp.fromDate(entry.publishedAt)
            : admin.firestore.FieldValue.serverTimestamp(),
          ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
          topicTags: tagged.topicTags,
          geographyTags: tagged.geographyTags,
          matchTrail: tagged.matchTrail,
          verticals: source.verticals || [],
          ...(tagged.sensitive
            ? { sensitive: true, sensitiveReason: tagged.sensitiveReason || null }
            : { sensitive: false }),
        });
        writes += 1;
      });

      if (writes > 0) {
        await batch.commit();
        summary.itemsCreated += writes;
      }
    }

    await sourceDoc.ref.update({
      lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSuccessAt: admin.firestore.FieldValue.serverTimestamp(),
      lastItemCount: fresh.length,
      consecutiveFailures: 0,
      lastError: null,
    });
  }

  console.log('[media-opportunities] Ingestion complete', summary);
  return summary;
}

/**
 * Scheduled ingestion, every three hours.
 *
 * This started at twice a day on the reasoning that opportunity windows are measured in days,
 * which was right about the windows and wrong about the feeds. Measured against the live source
 * set: BristolLive's feed holds roughly 26 items, about one day of publishing; Bristol24/7 about
 * the same. A feed that only exposes its most recent items does not wait for us — anything
 * published and pushed off the end between two runs is not late, it is permanently missing, and
 * the brief's central claim is a count of what ran. Missing items understate coverage and
 * silently weaken the one number the document lives on.
 *
 * Three hours is chosen against the narrowest feed rather than as a round number: ~26 items over
 * ~24 hours is about one item per hour, so a three-hour gap leaves a comfortable margin before
 * any local daily could roll over an entire feed's worth of items between runs. It is still
 * polite polling — eight conditional requests a day per feed, with the declared user agent —
 * and well short of the minute-by-minute churn that costs money and irritates publishers.
 *
 * Items are deduplicated by canonical URL hash and written once, so a more frequent run does not
 * inflate the pool: it only reduces what the pool never sees.
 */
export const ingestMediaSources = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('0 */3 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    await runIngestion();
    return null;
  });

// ---------------------------------------------------------------------------
// Slices 3 & 4 — clustering, momentum, org matching
// ---------------------------------------------------------------------------

/** A pool item is a WorkingItem plus the original Timestamp, kept so an evidence entry
 *  can be written back with the exact stored publication time rather than a re-derived one. */
type PoolItem = WorkingItem & { publishedAt: admin.firestore.Timestamp };

type Theme = {
  /** Either a controlled-taxonomy topic label, or `watchlist:<term>`. */
  key: string;
  label: string;
  kind: 'topic' | 'watchlist';
  items: PoolItem[];
};

type GenerateSummary = {
  orgsConsidered: number;
  orgsEnabled: number;
  opportunitiesCreated: number;
  opportunitiesExpired: number;
};

/**
 * Builds each enabled organisation's queue.
 *
 * The gate that matters is the double test: a theme must have real external momentum
 * AND the organisation must have a credible contribution of its own (an approved story
 * whose Smart Distribution tags overlap the theme, or its own watchlist terms appearing
 * in the coverage). A theme with momentum and nothing to say about it is not an
 * opportunity, it is just news — and a dashboard full of news is what customers already
 * ignore everywhere else.
 */
async function runGeneration(onlyOrgId?: string): Promise<GenerateSummary> {
  const summary: GenerateSummary = {
    orgsConsidered: 0,
    orgsEnabled: 0,
    opportunitiesCreated: 0,
    opportunitiesExpired: 0,
  };

  const now = Date.now();
  const windowStart = admin.firestore.Timestamp.fromMillis(now - DEVELOPING_WINDOW_DAYS * DAY_MS);

  // One read of the shared item pool per run, reused for every org.
  const itemsSnap = await db
    .collection('mediaItems')
    .where('publishedAt', '>=', windowStart)
    .orderBy('publishedAt', 'desc')
    .limit(1500)
    .get();

  const pool: PoolItem[] = itemsSnap.docs
    .filter((d) => d.data().sensitive !== true)
    .map((d) => {
      const data = d.data() as any;
      const ts: admin.firestore.Timestamp = data.publishedAt;
      return {
        id: d.id,
        sourceId: data.sourceId,
        sourceName: data.sourceName,
        title: data.title,
        url: data.url,
        summary: data.summary,
        publishedAt: ts,
        publishedAtMs: ts?.toMillis ? ts.toMillis() : now,
        topicTags: data.topicTags || [],
        geographyTags: data.geographyTags || [],
        verticals: data.verticals || [],
      };
    });

  const orgsSnap = onlyOrgId
    ? { docs: [await db.collection('orgs').doc(onlyOrgId).get()] }
    : await db.collection('orgs').get();

  for (const orgDoc of orgsSnap.docs) {
    if (!orgDoc.exists) continue;
    summary.orgsConsidered += 1;
    const org = orgDoc.data() as any;
    const orgId = orgDoc.id;

    const settingsSnap = await db
      .collection('orgs')
      .doc(orgId)
      .collection('mediaOpportunitySettings')
      .doc('config')
      .get();
    const settings = settingsSnap.data() as any;
    if (!settings?.enabled) continue;
    summary.orgsEnabled += 1;

    const vertical: string = org.vertical || 'dmo';
    const mutedTopics: string[] = settings.mutedTopics || [];
    const watchlistTerms: string[] = (settings.watchlistTerms || []).filter(
      (t: string) => typeof t === 'string' && t.trim().length >= 3
    );

    // The org's own approved material. `Ready` and `Sent` only: a draft is not something
    // a comms lead can offer a journalist this afternoon.
    const releasesSnap = await db
      .collection('orgs')
      .doc(orgId)
      .collection('releases')
      .where('status', 'in', ['Ready', 'Sent'])
      .orderBy('createdAt', 'desc')
      .limit(60)
      .get();

    const releases = releasesSnap.docs.map((d) => {
      const r = d.data() as any;
      const sd = r.smartDistribution || {};
      return {
        id: d.id,
        headline: r.headline as string,
        topics: [...(sd.topics || []), ...(sd.editorialFocus || [])] as string[],
        geographies: (sd.geographies || []) as string[],
      };
    });

    // Priority topics: explicit config first, else inferred from the org's own approved
    // stories, so a customer who has configured nothing is not silent on day one.
    const configuredTopics: string[] = settings.priorityTopics || [];
    const inferredTopics = [...new Set(releases.flatMap((r) => r.topics))];
    const priorityTopics = (configuredTopics.length ? configuredTopics : inferredTopics).filter(
      (t) => !mutedTopics.includes(t)
    );
    const priorityGeographies: string[] = settings.priorityGeographies || [];

    // Only coverage from sources curated for this org's vertical.
    const relevant = pool.filter((i) => i.verticals.includes(vertical));

    // --- Clustering. One theme per topic label, plus one per watchlist term. Simple,
    // explainable, and good enough at this volume; embedding-based clustering is a
    // later slice and will need this baseline to be measured against.
    const themes = new Map<string, Theme>();

    for (const topic of priorityTopics) {
      const items = relevant.filter((i) => i.topicTags.includes(topic));
      if (items.length) themes.set(topic, { key: topic, label: topic, kind: 'topic', items });
    }

    for (const term of watchlistTerms) {
      const items = relevant.filter(
        (i) => containsTerm(i.title, term) || (i.summary ? containsTerm(i.summary, term) : false)
      );
      if (items.length) {
        themes.set(`watchlist:${term.toLowerCase()}`, {
          key: `watchlist:${term.toLowerCase()}`,
          label: term,
          kind: 'watchlist',
          items,
        });
      }
    }

    // --- Momentum + match, then rank and cap.
    type Candidate = {
      dedupeKey: string;
      payload: Record<string, unknown>;
      rank: number;
    };
    const candidates: Candidate[] = [];

    for (const theme of themes.values()) {
      const { momentum, distinctSourceCount, windowDays } = assessMomentum(theme.items);
      if (!momentum) continue;

      const windowMs = windowDays * DAY_MS;
      const inWindow = theme.items
        .filter((i) => i.publishedAtMs >= now - windowMs)
        .sort((a, b) => b.publishedAtMs - a.publishedAtMs);
      if (inWindow.length < 2) continue;

      // Geography gate. Applied only when the org has stated a preference AND the theme
      // carries geography tags at all — an untagged theme is not evidence of the wrong
      // area, and silently dropping it would look like the feature is broken.
      if (priorityGeographies.length) {
        const themeGeos = new Set(inWindow.flatMap((i) => i.geographyTags));
        if (themeGeos.size && !priorityGeographies.some((g) => themeGeos.has(g))) continue;
      }

      const matchedReleases = releases.filter((r) =>
        theme.kind === 'topic'
          ? r.topics.includes(theme.label)
          : r.topics.some((t) => theme.items.some((i) => i.topicTags.includes(t)))
      );

      // Confidence: high requires independent breadth AND something of the org's own to
      // say. Anything below medium is not written at all — an empty queue is an honest
      // result and the thing that keeps the queue worth opening.
      const confidence: 'high' | 'medium' | null =
        distinctSourceCount >= MIN_SOURCES_EMERGING && matchedReleases.length > 0
          ? 'high'
          : distinctSourceCount >= MIN_SOURCES_DEVELOPING
            ? 'medium'
            : null;
      if (!confidence) continue;

      const { action, urgency } = chooseAction({
        momentum,
        hasMatchedRelease: matchedReleases.length > 0,
        isWatchlistTheme: theme.kind === 'watchlist',
      });

      const evidence = inWindow.slice(0, 6).map((i) => ({
        mediaItemId: i.id,
        sourceName: i.sourceName,
        title: i.title,
        url: i.url,
        publishedAt: i.publishedAt,
      }));

      const sourceNames = [...new Set(inWindow.map((i) => i.sourceName))];
      const matchedTopics =
        theme.kind === 'topic'
          ? [theme.label]
          : [...new Set(inWindow.flatMap((i) => i.topicTags))].filter((t) => priorityTopics.includes(t));

      const title =
        theme.kind === 'watchlist'
          ? `${theme.label} is being covered — ${sourceNames.length} source${sourceNames.length === 1 ? '' : 's'} this week`
          : `${theme.label} is moving in the media agenda`;

      const summaryText =
        `${inWindow.length} item${inWindow.length === 1 ? '' : 's'} across ${sourceNames.length} ` +
        `source${sourceNames.length === 1 ? '' : 's'} in the past ${windowDays <= 3 ? '72 hours' : `${windowDays} days`}` +
        `: ${sourceNames.slice(0, 4).join(', ')}${sourceNames.length > 4 ? ' and others' : ''}.`;

      const rationale: string[] = [];
      if (theme.kind === 'watchlist') {
        rationale.push(`"${theme.label}" is on your watchlist and appears in this coverage.`);
      } else {
        rationale.push(
          configuredTopics.length
            ? `${theme.label} is one of your priority themes.`
            : `${theme.label} matches the focus of stories you have already published.`
        );
      }
      if (matchedReleases.length) {
        rationale.push(
          `You have ${matchedReleases.length} approved ` +
            `${matchedReleases.length === 1 ? 'story' : 'stories'} tagged to this theme, ` +
            `so you have something to contribute today.`
        );
      } else {
        rationale.push(
          'You do not yet have an approved story tagged to this theme — worth deciding whether one of your members does.'
        );
      }

      const caveat =
        'This shows what was published and where your own material overlaps it. It does not establish that a journalist ' +
        'wants this story, and it is not a guarantee of coverage — the judgement is yours.';

      // The dedupe key includes the window bucket so the same theme is not re-raised
      // every run, but genuinely does come back if it is still live a week later.
      const weekBucket = Math.floor(now / (7 * DAY_MS));
      const dedupeKey = `${GENERATOR_VERSION}:${theme.key}:${weekBucket}`;

      candidates.push({
        dedupeKey,
        rank:
          (momentum === 'emerging_opportunity' ? 100 : 0) +
          (confidence === 'high' ? 50 : 0) +
          distinctSourceCount * 5 +
          inWindow.length,
        payload: {
          orgId,
          status: 'new',
          title,
          summary: summaryText,
          rationale,
          suggestedAction: action,
          urgency,
          confidence,
          momentum,
          itemCount: inWindow.length,
          distinctSourceCount,
          windowDays,
          topicTags: [...new Set(inWindow.flatMap((i) => i.topicTags))].slice(0, 12),
          geographyTags: [...new Set(inWindow.flatMap((i) => i.geographyTags))].slice(0, 8),
          matchedTopics,
          evidence,
          matchedReleaseIds: matchedReleases.map((r) => r.id),
          matchedReleaseHeadlines: matchedReleases.slice(0, 3).map((r) => r.headline),
          caveat,
          dedupeKey,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromMillis(now + OPPORTUNITY_TTL_DAYS * DAY_MS),
          generatorVersion: GENERATOR_VERSION,
        },
      });
    }

    candidates.sort((a, b) => b.rank - a.rank);
    const capped = candidates.slice(0, MAX_OPPORTUNITIES_PER_RUN);

    const oppsCol = db.collection('orgs').doc(orgId).collection('mediaOpportunities');

    for (const candidate of capped) {
      // Document ID *is* the dedupe key, so a re-run cannot duplicate a card and a
      // customer's save/dismiss decision on it is never quietly reset by the next run.
      const ref = oppsCol.doc(crypto.createHash('sha256').update(candidate.dedupeKey).digest('hex').slice(0, 24));
      const existing = await ref.get();
      if (existing.exists) continue;
      await ref.set(candidate.payload);
      summary.opportunitiesCreated += 1;
    }

    // Expire anything past its TTL that the customer never resolved. Kept, not deleted:
    // "we showed you this and you did not act" is exactly the history that makes the
    // useful-opportunity-rate measurable later.
    const staleSnap = await oppsCol
      .where('status', '==', 'new')
      .where('expiresAt', '<=', admin.firestore.Timestamp.fromMillis(now))
      .limit(50)
      .get();
    if (!staleSnap.empty) {
      const batch = db.batch();
      staleSnap.docs.forEach((d) => batch.update(d.ref, { status: 'expired' }));
      await batch.commit();
      summary.opportunitiesExpired += staleSnap.size;
    }
  }

  console.log('[media-opportunities] Generation complete', summary);
  return summary;
}

/** Daily generation, after the morning ingestion has landed. */
export const generateMediaOpportunities = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('30 7 * * *')
  .timeZone('Europe/London')
  .onRun(async () => {
    await runGeneration();
    return null;
  });

// ---------------------------------------------------------------------------
// Superadmin callables — source registry
// ---------------------------------------------------------------------------

/** Installs (or refreshes) the curated seed source set. Idempotent: fixed document IDs,
 *  and it never re-enables a source an operator has deliberately turned off. */
export const seedMediaSources = functions.https.onCall(async (_data, context) => {
  requireSuperAdmin(context);

  let created = 0;
  let updated = 0;

  for (const seed of SEED_SOURCES) {
    const ref = db.collection('mediaSources').doc(seed.id);
    const existing = await ref.get();
    const base = {
      name: seed.name,
      feedUrl: seed.feedUrl,
      siteUrl: seed.siteUrl || null,
      format: seed.format,
      verticals: seed.verticals,
      outletType: seed.outletType || null,
      geographies: seed.geographies || [],
      defaultTopics: seed.defaultTopics || [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (existing.exists) {
      await ref.update(base);
      updated += 1;
    } else {
      await ref.set({
        ...base,
        enabled: true,
        consecutiveFailures: 0,
        lastError: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: context.auth!.uid,
      });
      created += 1;
    }
  }

  return { created, updated, total: SEED_SOURCES.length };
});

/** Create or edit one source. Feed URL must be https — no plaintext feed reads. */
export const upsertMediaSource = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);

  const sourceId = (data?.sourceId as string | undefined)?.trim();
  const name = (data?.name as string | undefined)?.trim();
  const feedUrl = (data?.feedUrl as string | undefined)?.trim();

  if (!name || !feedUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'name and feedUrl are required.');
  }
  if (!/^https:\/\//i.test(feedUrl)) {
    throw new functions.https.HttpsError('invalid-argument', 'feedUrl must be an https URL.');
  }
  const verticals = Array.isArray(data?.verticals) ? data.verticals : [];
  if (!verticals.length) {
    throw new functions.https.HttpsError('invalid-argument', 'At least one vertical is required.');
  }

  const payload = {
    name,
    feedUrl,
    siteUrl: (data?.siteUrl as string | undefined)?.trim() || null,
    format: data?.format === 'atom' ? 'atom' : 'rss',
    verticals,
    outletType: (data?.outletType as string | undefined) || null,
    geographies: Array.isArray(data?.geographies) ? data.geographies : [],
    defaultTopics: Array.isArray(data?.defaultTopics) ? data.defaultTopics : [],
    enabled: data?.enabled !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (sourceId) {
    await db.collection('mediaSources').doc(sourceId).update(payload);
    return { sourceId, created: false };
  }

  const ref = await db.collection('mediaSources').add({
    ...payload,
    consecutiveFailures: 0,
    lastError: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: context.auth!.uid,
  });
  return { sourceId: ref.id, created: true };
});

/**
 * Fetches one feed and reports what would be parsed, without writing anything.
 * The registry is only as good as an operator's ability to check a feed before
 * trusting it, so this is a first-class tool rather than a debug afterthought.
 */
export const testMediaSourceFeed = functions.https.onCall(async (data, context) => {
  requireSuperAdmin(context);
  const feedUrl = (data?.feedUrl as string | undefined)?.trim();
  if (!feedUrl || !/^https:\/\//i.test(feedUrl)) {
    throw new functions.https.HttpsError('invalid-argument', 'An https feedUrl is required.');
  }
  try {
    const xml = await fetchFeed(feedUrl);
    const entries = parseFeed(xml);
    return {
      ok: true,
      itemCount: entries.length,
      sample: entries.slice(0, 5).map((e) => ({
        title: e.title,
        url: e.url,
        publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
        hasSummary: !!e.summary,
        author: e.author || null,
      })),
    };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err).slice(0, 300) };
  }
});

/** Manual ingestion trigger, for operating the registry and for demo preparation. */
export const runMediaIngestionNow = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (_data, context) => {
    requireSuperAdmin(context);
    return await runIngestion();
  });

/** Manual generation trigger. `orgId` limits it to one tenant. */
export const runMediaOpportunityGenerationNow = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);
    const orgId = (data?.orgId as string | undefined)?.trim();
    return await runGeneration(orgId || undefined);
  });

// ---------------------------------------------------------------------------
// Org-facing callables — settings, status, feedback
// ---------------------------------------------------------------------------

/** Saves an org's watch configuration. Admin-or-superadmin, via requireTeamMember plus
 *  an explicit Admin check, matching how the rest of Settings behaves. */
export const updateMediaOpportunitySettings = functions.https.onCall(async (data, context) => {
  const orgId = (data?.orgId as string | undefined)?.trim();
  if (!orgId) throw new functions.https.HttpsError('invalid-argument', 'orgId is required.');
  const caller = await requireTeamMember(context, orgId);

  if (!caller.isSuperAdmin) {
    const userSnap = await db.collection('orgs').doc(orgId).collection('users').doc(caller.uid).get();
    if (userSnap.data()?.role !== 'Admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only an organisation Admin can change these settings.');
    }
  }

  const clean = (arr: unknown, max: number) =>
    Array.isArray(arr)
      ? [...new Set(arr.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))].slice(0, max)
      : [];

  await db
    .collection('orgs')
    .doc(orgId)
    .collection('mediaOpportunitySettings')
    .doc('config')
    .set(
      {
        orgId,
        enabled: data?.enabled === true,
        priorityTopics: clean(data?.priorityTopics, 20),
        priorityGeographies: clean(data?.priorityGeographies, 8),
        watchlistTerms: clean(data?.watchlistTerms, 30),
        mutedTopics: clean(data?.mutedTopics, 20),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: caller.uid,
      },
      { merge: true }
    );

  return { ok: true };
});

/**
 * Records the customer's decision on a card. Status transitions are Cloud-Function-only
 * (firestore.rules denies all client writes to mediaOpportunities) so the record of what
 * a customer was shown and what they chose stays an audit trail rather than editable UI state.
 */
export const setMediaOpportunityStatus = functions.https.onCall(async (data, context) => {
  const orgId = (data?.orgId as string | undefined)?.trim();
  const opportunityId = (data?.opportunityId as string | undefined)?.trim();
  const status = data?.status as string | undefined;

  if (!orgId || !opportunityId) {
    throw new functions.https.HttpsError('invalid-argument', 'orgId and opportunityId are required.');
  }
  const allowed = ['new', 'saved', 'dismissed', 'acted_on'];
  if (!status || !allowed.includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', `status must be one of: ${allowed.join(', ')}`);
  }

  const caller = await requireTeamMember(context, orgId);
  const ref = db.collection('orgs').doc(orgId).collection('mediaOpportunities').doc(opportunityId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Opportunity not found.');

  // An optional release link closes the loop opportunity -> release -> coverage, which is
  // what lets a dashboard say "3 opportunities acted on, 2 became releases, 1 was placed".
  // Checked against the org's own releases so a caller cannot attach someone else's.
  const releaseId = typeof data?.releaseId === 'string' ? data.releaseId.trim() : '';
  let actedOnReleaseId: string | null = null;
  if (releaseId && status === 'acted_on') {
    const releaseSnap = await db.collection('orgs').doc(orgId).collection('releases').doc(releaseId).get();
    if (!releaseSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Release not found in this organisation.');
    }
    actedOnReleaseId = releaseId;
  }

  await ref.update({
    status,
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedByUid: caller.uid,
    ...(actedOnReleaseId ? { actedOnReleaseId } : {}),
  });

  return { ok: true };
});

/** Captures a reason alongside the status change. This is the dataset that eventually
 *  answers the only metric that matters: useful opportunities / opportunities shown. */
export const submitMediaOpportunityFeedback = functions.https.onCall(async (data, context) => {
  const orgId = (data?.orgId as string | undefined)?.trim();
  const opportunityId = (data?.opportunityId as string | undefined)?.trim();
  const reason = data?.reason as string | undefined;

  const allowedReasons = [
    'relevant',
    'not_relevant',
    'too_late',
    'no_angle',
    'wrong_geography',
    'sensitive_subject',
  ];
  if (!orgId || !opportunityId || !reason || !allowedReasons.includes(reason)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `orgId, opportunityId and a reason (${allowedReasons.join(', ')}) are required.`
    );
  }

  const caller = await requireTeamMember(context, orgId);
  const oppRef = db.collection('orgs').doc(orgId).collection('mediaOpportunities').doc(opportunityId);
  if (!(await oppRef.get()).exists) {
    throw new functions.https.HttpsError('not-found', 'Opportunity not found.');
  }

  await db.collection('orgs').doc(orgId).collection('mediaOpportunityFeedback').add({
    orgId,
    opportunityId,
    reason,
    note: typeof data?.note === 'string' ? data.note.slice(0, 1000) : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: caller.uid,
    createdByName: caller.name || null,
  });

  // A negative reason resolves the card as dismissed in the same round trip, so the
  // queue actually gets shorter when a customer tells us something was not useful.
  if (reason !== 'relevant') {
    await oppRef.update({
      status: 'dismissed',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedByUid: caller.uid,
    });
  }

  return { ok: true };
});

/**
 * Re-runs tagItem over already-stored mediaItems and writes back the corrected tags.
 *
 * Ingestion is deliberately write-once (`if (existing[idx].exists) return`), so an item keeps
 * whatever tags it was given on the day it arrived. That is the right default — it means a
 * brief printed last week can still be explained — but it also means a fix to the tagging
 * rules reaches only future items, and the pool built under mo-mvp-1 keeps its errors
 * indefinitely. Deleting and re-ingesting is not an option: the feeds only carry their most
 * recent two dozen items, so it would destroy the back window rather than rebuild it.
 *
 * This is the escape hatch. Superadmin only, idempotent, and dryRun by default so the blast
 * radius can be read before anything is written. It re-derives topicTags, geographyTags,
 * matchTrail and sensitive from each item's own stored title and summary — it never refetches
 * anything, so no publisher is touched and no item's identity, URL or date changes.
 */
export const retagMediaItems = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    requireSuperAdmin(context);

    // Writes only happen when explicitly asked for. A silent mass update of the evidence
    // pool behind a brief is exactly the kind of thing that should require intent.
    const dryRun = data?.dryRun !== false;

    const sourceSnap = await db.collection('mediaSources').get();
    const sourceById = new Map(
      sourceSnap.docs.map((d) => [
        d.id,
        {
          geographies: (d.data().geographies as string[]) || [],
          defaultTopics: (d.data().defaultTopics as string[]) || [],
        },
      ])
    );

    const summary = {
      dryRun,
      itemsRead: 0,
      itemsChanged: 0,
      topicsRemoved: 0,
      topicsAdded: 0,
      sensitivityChanged: 0,
      generatorVersion: GENERATOR_VERSION,
    };

    const pending: Array<{ ref: admin.firestore.DocumentReference; update: Record<string, unknown> }> = [];
    const snap = await db.collection('mediaItems').get();

    for (const doc of snap.docs) {
      const item = doc.data() as any;
      summary.itemsRead += 1;

      const source = sourceById.get(item.sourceId);
      const tagged = tagItem({
        title: item.title || '',
        summary: item.summary,
        sourceGeographies: source?.geographies || [],
        sourceDefaultTopics: source?.defaultTopics || [],
      });

      const before: string[] = item.topicTags || [];
      const after = tagged.topicTags;
      const removed = before.filter((t) => !after.includes(t));
      const added = after.filter((t) => !before.includes(t));
      const sensitivityMoved = Boolean(item.sensitive) !== tagged.sensitive;

      if (!removed.length && !added.length && !sensitivityMoved) continue;

      summary.itemsChanged += 1;
      summary.topicsRemoved += removed.length;
      summary.topicsAdded += added.length;
      if (sensitivityMoved) summary.sensitivityChanged += 1;

      pending.push({
        ref: doc.ref,
        update: {
          topicTags: tagged.topicTags,
          geographyTags: tagged.geographyTags,
          matchTrail: tagged.matchTrail,
          retaggedAt: admin.firestore.FieldValue.serverTimestamp(),
          retaggedVersion: GENERATOR_VERSION,
          ...(tagged.sensitive
            ? { sensitive: true, sensitiveReason: tagged.sensitiveReason || null }
            : { sensitive: false, sensitiveReason: null }),
        },
      });
    }

    if (!dryRun && pending.length) {
      for (let i = 0; i < pending.length; i += 400) {
        const batch = db.batch();
        for (const { ref, update } of pending.slice(i, i + 400)) batch.update(ref, update);
        await batch.commit();
      }
    }

    console.log('[media-opportunities] Retag complete', summary);
    return summary;
  });
