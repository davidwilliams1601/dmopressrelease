# Phased Implementation Plan

Each phase should land as its own PR against `feature/smart-distribution-foundation`, reviewed
against the acceptance criteria below before merging to `main`.

## Phase 1 — Foundation: owned contact management (build regardless of network launch timing)

**Scope**
- Extend `Recipient` type with the optional Smart Distribution fields (§2 of
  `data-model-and-security.md`). No breaking change to existing outlet-list flows.
- CSV/XLSX import wizard: header auto-mapping, alias table, manual override, validation
  preview, confirm-to-import step, downloadable template, saved mapping profile per org.
- Duplicate detection, invalid-email detection, suppression/do-not-contact fields.
- `platform/config` doc, `mediaTaxonomy` field (QA fix: doc previously said `platform/mediaTaxonomy`,
  a naming drift vs. the actual implementation) + admin UI to manage editorial focus / geography /
  outlet type / topics terms (extends the existing `theme-taxonomy-card.tsx` pattern).

**Acceptance criteria**
- A CSV with non-standard headers (e.g. "Beat", "Region") maps to `editorialFocus` and
  `geography` automatically and is labelled "Editorial focus" / "Geography" in the UI.
- No row is written to Firestore before the user confirms the import screen.
- Re-uploading the same file for the same org detects previously-imported duplicates by email.
- A saved mapping profile is offered and applied automatically on a second upload for the same
  organisation.

## Phase 2 — Superadmin media network

**Scope**
- `mediaNetworkContacts` and `mediaNetworkImportBatches` collections + security rules from
  `data-model-and-security.md` §3.
- Superadmin console screens: upload → source/rights selection → mapping → validation → review
  queue → publish.
- `networkStatus` lifecycle (`review` → `active` / `suppressed` / `archived`).
- Credit ledger + wallet collections and rules (`creditTransactions`, `creditWallet`), plus the
  superadmin actions table in `import-wizard-and-credits.md` §4 (grant, purchase, refund,
  adjustment, reversal, suspend).
- Audit log for any direct read of raw network-contact identity by a superadmin.

**Acceptance criteria**
- No client role other than `superAdmin` can read a `mediaNetworkContacts` document (verified
  with Firestore rules unit tests).
- A newly imported batch defaults every row to `networkStatus: 'review'`; nothing is
  recommendable until explicitly published.
- Every credit balance change produces exactly one `creditTransactions` document; balances are
  never edited in place.
- A `grant` with an expiry date is visible to the organisation with its reason and expiry shown
  verbatim (e.g. "100 launch credits — Smart Distribution design partner, valid until
  30 Nov 2026").

## Phase 3 — Matching & recommendation snapshots

**Scope**
- Callable Cloud Function: given an approved story, return a deduplicated, ranked list drawing
  from (a) the org's own eligible `Recipient` records and (b) eligible `MediaNetworkContact`
  records, ranked by editorial-focus match, geography, outlet type, recency of related
  coverage, and (for the org's own contacts) relationship history.
- Eligibility filters: exclude suppressed / opted-out / bounced / do-not-contact / frequency-
  capped contacts on both sides; exclude a network contact if the org already has that same
  person as a named `Recipient` (name+email match).
- Write the result to `orgs/{orgId}/recommendationSnapshots/{snapshotId}` — anonymised label,
  outlet category, editorial focus, recent coverage themes, rationale, match band (Strong/Good/
  Possible), credit cost (0 for customer-owned, 1 for network), and source.
- Recommendation UI: single combined list, customer contacts shown named, network contacts
  shown anonymised with `[Include]` / `[Not relevant]` actions and a pre-send credit-cost
  summary (see preview example in `import-wizard-and-credits.md` §5).

**Acceptance criteria**
- Matches the acceptance criterion agreed earlier: *"When a story is approved, Press Pilot
  returns a deduplicated, relevance-ranked list containing both eligible customer-owned
  contacts and eligible Press Pilot-network contacts. Customer-owned contacts are visibly
  identified and cost zero credits. Press Pilot-network contacts are anonymised, visibly
  labelled, and consume credits only when selected and successfully sent."*
- No API response to an org client ever includes a network contact's name, email or profile
  URL — verified by an integration test asserting the response schema.
- A "why wasn't this person recommended?" diagnostic (superadmin-only) can show one of:
  wrong focus, wrong location, duplicate of an existing org contact, recently contacted,
  suppressed, inactive, low relevance.

## Phase 4 — Controlled distribution & credit debit

**Scope**
- Extend `sendJobs` with the `recipients` subcollection (`SendJobRecipient`, §4 of
  `data-model-and-security.md`), recording source, credit-transaction reference and delivery
  status per recipient.
- Debit sequence exactly as specified in `import-wizard-and-credits.md` §4 (review → select →
  confirm → accepted-for-delivery).
- Hard-bounce and delivery-failure auto-refund handling.
- Org-facing credit wallet + transaction history screen.

**Acceptance criteria**
- Selecting 5 network recommendations and confirming a send that dispatches to only 4 (1
  rejected pre-send) debits exactly 4 credits, not 5.
- A hard bounce on a network-sourced recipient produces an automatic `refund` ledger entry
  referencing the original `usage` transaction's `campaignId`.
- Cancelling a queued send before dispatch produces zero `usage` transactions.

## Phase 5 — Outcome intelligence & board reporting

**Scope**
- Per-recipient outcome capture: delivered, bounced, replied, interested, declined, coverage
  achieved (+ URL), plus a lightweight user rating ("good match" / "not relevant" / "already
  known" / "do not recommend again").
- Feed outcomes back into ranking (e.g. de-prioritise repeatedly "not relevant" categories per
  org) without ever sharing one org's feedback with another.
- Smart Distribution dashboard: recommended vs selected vs delivered vs engaged vs coverage, by
  editorial focus / geography / story type.
- Board-report integration: "matched to N relevant contacts, generated M responses, achieved K
  recorded pieces of coverage" line item.

**Acceptance criteria**
- Feedback and outcome data for Org A is never queryable by, or aggregated into a UI visible
  to, Org B.
- The board report for a story shows matched/response/coverage counts sourced from
  `recommendationSnapshots` + `sendJobs.recipients`, not from a manually maintained figure.

## Phase 6 — Network intelligence & Enterprise (build only after 3–5 active customers with real campaign data)

**Scope**
- Recommendation-quality scoring based on confirmed outcomes.
- Media coverage-gap reports per organisation.
- Federated, permissioned distribution for parent/child organisations (Chambers, BID networks,
  national trade bodies), reusing the existing `parentOrgId` / `ancestorOrgIds` federation
  fields already present in `firestore.rules`.
- Shared/allocated credit pools for Enterprise accounts.

**Acceptance criteria**
- Deferred — to be defined once Phase 5 outcome data exists across enough organisations to
  validate the scoring approach.

## Explicitly deferred until the loop above is proven

- Automated, always-on web enrichment of network contacts at scale.
- A complex ML relevance model (Phase 3 uses transparent weighted rules first).
- Self-serve credit checkout/invoicing integration.
- Cross-organisation benchmark reports.
- Differentiated per-contact credit pricing (e.g. "premium" contacts).
