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

---

## Destination Briefs (prospect-facing, superadmin-only)

A **Destination Media Opportunity Brief** is a retrospective 30-day replay of a *prospect's*
sector coverage, produced on demand and printed. It exists for three reasons at once: it is a
sales artefact for trade shows, it is the first manual version of the Media Opportunities
experience, and it is the cheapest honest test of whether the ingested source set actually
finds anything worth paying for.

### Why the rules differ from an opportunity

A customer has an inventory of approved releases, so an opportunity can be gated on
"do you have a credible contribution to make?". A prospect has no inventory at all. Guessing
what they *could* have said would be exactly the kind of unfalsifiable claim this feature is
designed not to make.

So the gate is replaced with a different, deterministic, checkable fact:

> **Was this organisation named in the coverage, or did the theme run without it?**

That is a fact the prospect can verify in thirty seconds by clicking the links, which is the
whole point. It produces the only two routes a brief ever asserts:

| Route | Means |
|---|---|
| `ran_without_you` | No item in the theme named the organisation or any of its watch terms |
| `you_were_in_it` | At least one item did |

A single naming item anywhere in the theme flips the route. Telling a DMO it was absent from
coverage it was actually in would end the conversation, so the test is deliberately
asymmetric in the prospect's favour.

### Evidence thresholds

Same spirit as opportunities, tuned for a printed page:

| Constant | Value | Why |
|---|---|---|
| `BRIEF_WINDOW_DAYS` | 30 | Long enough to show a pattern, recent enough to be current |
| `BRIEF_MIN_ITEMS` | 3 | Two items is a coincidence |
| `BRIEF_MIN_SOURCES` | 2 | One outlet publishing repeatedly is not the agenda moving |
| `BRIEF_MAX_THEMES` | 6 | A brief that lists everything asserts nothing |
| `BRIEF_MAX_EVIDENCE_PER_THEME` | 6 | Enough to be checkable, short enough to be read |
| `BRIEF_MAX_APPEARANCES` | 10 | — |

A brief where **no** theme clears the bar is still generated, stored and shown, and it says so
plainly on the page. A quiet window is a real finding about the source set; suppressing it
would hide the single case an operator most needs to see before walking into a meeting.

### Which items are shown as evidence

`selectThemeEvidence` picks the rows, in this priority: items naming the prospect, then the
first item in the theme, then the first item from a **different** outlet, then the most recent
item, then the remaining slots spread evenly across the window. Rows print chronologically and
carry a `role` so the page can label them.

This replaced a most-recent-six selection that produced briefs where a theme described as
running for sixteen days was evidenced entirely by items from its final day, while the document
asserted "a second outlet followed 1 day later" with nothing behind it. The `first` and
`second_outlet` rows exist specifically so the response-window claim is checkable on the page.

### The response window

The most useful number on the brief, because it is a fact about time rather than a claim about
value: **hours from the first item in a theme to the first item from a *different* outlet.**

The same outlet publishing twice does not count. This is the observed window in which a
response would have been timely — it requires no prediction and no future-state claim.

### The requested window vs. the window the data covers

`windowDays` is what was asked for. `dataStartMs`, `dataEndMs` and `dataSpanDays` are what the
items actually cover, and **every period printed on a brief comes from the latter**. A 30-day
brief generated a fortnight after ingestion started covers a fortnight; printing "30-day replay"
over it overstates the document's reach, which is the easiest claim on the page for a prospect
to disprove. When the shortfall exceeds a fifth of the requested window, `windowUnderfilled` is
set and the gaps section states it outright.

### Source default topics are a fallback, not an addition

Under `mo-mvp-1`, a source's `defaultTopics` were applied to every item alongside keyword
matching. Hospitality Net declares `['Tourism & travel', 'Food & drink']`, so a hotel-revenue
article was tagged food-and-drink and appeared as evidence under a theme it had nothing to do
with; theme item counts summed to more than the number of items reviewed. From `mo-mvp-2`,
`TOPIC_TERMS` matching runs first and `defaultTopics` applies **only when nothing matched** — its
honest use, recorded in `matchTrail` as `source default (no term matched)`.

Geography is not treated this way: a source's declared coverage area is a stable fact about the
outlet rather than a claim about the item, so it always applies.

Ingestion is write-once, so this fix reaches only future items. `retagMediaItems` re-derives
tags for the stored pool from each item's own title and summary — superadmin-only, `dryRun` by
default, and it never refetches a feed.

### Ranking

Themes that ran **without** the prospect rank first, then by distinct outlets, then item count,
then recency. Breadth of coverage beats volume: five outlets carrying a theme is a stronger
signal than one outlet carrying twelve items.

### What is computed vs. what a human writes

| On the brief | Origin |
|---|---|
| Every count, date, span, route, response window, evidence row, source list | Computed in `destination-brief-engine.ts`. Pure, no model, no network |
| `gaps` — "what this brief does not tell you" | Generated from the brief's own contents, never boilerplate. Never empty |
| Method statement, future-state paragraph | Fixed constants in `src/lib/destination-briefs.ts` |
| `headline`, `openingNote`, `closingNote` | Typed by a person. The only free prose on the document |

The stored `content` snapshot is **not client-writable**. If the analysis is wrong the brief is
regenerated. A document whose evidence could be hand-edited is worthless as a record, and the
entire feature is an argument about trustworthiness.

The printed page keeps measured findings and future-state claims in separate, labelled
sections. Blurring those two is the one failure mode that would discredit the document.

### The sending gate

The evidence thresholds decide whether a finding is true enough to record. They do not decide
whether a brief is strong enough to put in front of a communications director, and those are
different questions: a brief that honestly reports three days of data across two outlets is a
correct document and bad outreach.

`assessBriefSendability` scores every brief at generation and stores the result on `content`.
Five checks, all computed, each reporting its observed value whether it passed or failed:

| Check | Passes when |
|---|---|
| The window is filled | `windowUnderfilled` is false |
| Enough themes to show a pattern | `themes.length` >= `SENDABLE_MIN_THEMES` (3) |
| A theme that ran without them, across several outlets | a `ran_without_you` theme has >= 3 distinct outlets |
| At least one measurable response window | some theme has a non-null `responseWindowHours` |
| Enough outlets behind the brief | `sourcesRepresented` >= 4 |

The gate changes nothing about what a brief says. It blocks `status: 'final'` — the state that
means "this goes to a prospect" — and `updateDestinationBrief` enforces it server-side rather
than trusting whoever is in a hurry the night before a trade show. When a check fails the fix is
more ingestion time or more outlets, never softer prose over thinner evidence.

Overriding is allowed, because there are briefs whose weak numbers are the point of the
conversation, but it requires a written reason of at least fifteen characters and is recorded as
`gateOverride` on the brief. The slate shows which briefs went out below the bar and why.

The gate is screen-only. A prospect sees the findings and the gaps; they never see our internal
test of whether the findings were worth their time. Briefs generated before the gate existed have
no `sendability` block and are treated as unassessed rather than retro-judged.

### Data model

```
/mediaProspects/{prospectId}                  superadmin read, no client write
/mediaProspects/{prospectId}/briefs/{briefId} superadmin read, no client write
```

Prospect records are Press Pilot's own commercial pipeline — internal notes, named contacts —
and no tenant may read them under any circumstances.

### Functions

| Function | Type | Purpose |
|---|---|---|
| `upsertMediaProspect` | callable | Create/edit a prospect. Watch terms under 3 characters are dropped |
| `generateDestinationBrief` | callable | Reads the already-ingested `mediaItems` window, assembles and stores a brief |
| `updateDestinationBrief` | callable | Saves human framing and draft/final status only. `final` is gated on `content.sendability`; override requires `{override: true, overrideReason}` of 15+ characters |
| `deleteDestinationBrief` | callable | Removes a brief |
| `retagMediaItems` | callable | Re-runs tagging over already-stored `mediaItems`. `{dryRun: true}` by default; pass `{dryRun: false}` to write |

Nothing here fetches a feed. A brief can only ever see what `ingestMediaSources` has already
collected, so producing one can never quietly widen what the platform reads.

### UI

- `/dashboard/admin/briefs` — prospect registry, one-click build, slate overview
- `/dashboard/admin/briefs/[prospectId]/[briefId]` — the printable brief (`window.print()`,
  following the existing `print-report` pattern; no PDF library is added)

### Deploy

```
firebase deploy --only functions:upsertMediaProspect
firebase deploy --only functions:generateDestinationBrief
firebase deploy --only functions:updateDestinationBrief
firebase deploy --only functions:deleteDestinationBrief
firebase deploy --only functions:retagMediaItems
firebase deploy --only firestore:rules,firestore:indexes
```
