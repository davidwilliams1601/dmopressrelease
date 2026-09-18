# Media Opportunities — MVP product contract

Branch: `feature/media-opportunities-mvp`

## What this feature is

Media Opportunities is Press Pilot's intelligence layer. It monitors a small, curated set of
permitted feeds, groups related coverage into themes, and — only where the organisation has a
credible contribution of its own — surfaces a short, evidence-backed queue of opportunities for a
human to review.

It exists to serve the core promise, not to replace it: **seen, heard, renewed**. The platform
already captures, shapes, distributes and evidences member stories. This layer answers the one
question the platform cannot answer today: *which of those stories is most worth acting on now?*

## The one-sentence contract

> Monitor a curated source set, detect themes with genuine momentum, match them to the
> organisation's approved stories and configured priorities, and present a short queue of
> source-attributed opportunities with a recommended action — for a human to decide on.

## In scope (this branch)

- Platform-owned **source registry** (`/mediaSources`), superadmin managed, with health status.
- **RSS/Atom ingestion** on a schedule, storing normalised items with full provenance
  (source, title, url, publishedAt, feed-supplied summary, author where given).
- Deterministic **topic/geography tagging** against the existing controlled media taxonomy
  (`src/lib/media-taxonomy.ts`), with a visible match trail — no opaque scoring.
- Rules-based **momentum detection**:
  - 1 item = signal (never surfaced on its own)
  - ≥2 items from ≥2 distinct sources within 7 days = developing theme
  - ≥3 distinct sources within 72 hours = emerging opportunity candidate
- **Organisation matching** against vertical, configured priority themes, geography and
  approved (`Ready`/`Sent`) releases' `smartDistribution` tags.
- Per-tenant **opportunity records** with evidence links, rationale, suggested action, urgency,
  confidence and caveat.
- Read-only **Media Opportunities queue** in the dashboard, with evidence visible.
- **Feedback** capture: relevant, not relevant, too late, no angle, saved, acted on.

## Explicitly out of scope (this branch)

- Any automatic outbound send, pitch or journalist contact. The queue ends at *save*,
  *dismiss* or *create a response brief*. No path from an opportunity to a Smart Distribution
  send exists in this branch, deliberately — the Smart Distribution privacy, credit-reservation,
  webhook-auth and server-side send hardening comes first.
- Broad web crawling, defeating publisher controls, scraping blocked pages, social platforms.
- Journalist-level coverage mapping, influencer intelligence, predictive scoring,
  learning-to-rank, licensed content partnerships.
- Cross-customer learning or benchmarking of any kind.
- Pricing/metering enforcement. The add-on packaging is commercial work, not this slice.

## Data model

Platform-level (shared, source-attributed, never tenant data):

```text
/mediaSources/{sourceId}          # registry + health
/mediaItems/{itemId}              # normalised feed items, deduped by URL hash
```

Tenant-scoped (never leaves the org boundary):

```text
/orgs/{orgId}/mediaOpportunitySettings/config
/orgs/{orgId}/mediaOpportunities/{opportunityId}
/orgs/{orgId}/mediaOpportunityFeedback/{feedbackId}
```

One external article can be relevant to several destinations; each destination only ever sees its
own matched opportunity, its own saves, dismissals and feedback.

## Honesty rules the code enforces

1. Every opportunity carries at least two evidence items with real source name, title, URL and
   publication date. No evidence, no opportunity.
2. Deterministic facts (source count, distinct sources, dates, matched tags) are computed in code
   and stored separately from any generated narrative.
3. `confidence` degrades automatically: `high` needs ≥3 distinct sources and a matched release;
   `medium` needs ≥2 distinct sources; anything weaker is not surfaced at all.
4. `no_action` / `monitor` are valid recommended actions. A quiet week should look quiet.
5. Volume is capped per org per run (`MAX_OPPORTUNITIES_PER_RUN`). Precision over reach — the
   metric that matters is useful opportunity rate, not items ingested.
6. Only feed-supplied summaries are stored, never full article text.

## Slices

| Slice | Status | Contents |
|---|---|---|
| 1 | this branch | Source registry, RSS ingestion, normalised items, health status |
| 2 | this branch | Taxonomy tagging, geography extraction, match trail |
| 3 | this branch | Clustering + momentum thresholds |
| 4 | this branch | Org matching, opportunity generation, caps |
| 5 | this branch | Read-only queue UI + evidence drawer + admin registry |
| 6 | this branch | Feedback capture |
| 7 | later | Create-a-response-brief drafting, spokesperson/story inventory, digests |
| 8 | later | Outcome capture and reporting, superadmin quality review |

## Operational notes

- Cloud Functions are **not** deployed by Vercel. After merge, deploy individually from a local
  clone: `firebase deploy --only functions:ingestMediaSources && firebase deploy --only
  functions:generateMediaOpportunities && ...` — never batched, Google throttles concurrent updates.
- New Firestore indexes are in `firestore.indexes.json` and must be deployed with
  `firebase deploy --only firestore:indexes`.
- Ingestion is idempotent: items are keyed by a hash of the canonical URL, so re-runs and
  overlapping feed windows cannot create duplicates.
- The feature is dark by default. An org sees nothing until
  `mediaOpportunitySettings/config.enabled` is true.
