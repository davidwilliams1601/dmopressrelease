# Smart Distribution — Product & Technical Specification

Status: **Draft for review** (documentation only — no application code changes in this PR)
Branch: `feature/smart-distribution-foundation`
Owner: David Williams

## What this is

Smart Distribution lets a Press Pilot customer send an approved member story to relevant
media contacts drawn from **two pools**:

1. **Their own contacts** — uploaded by the organisation, fully visible, free to use.
2. **The Press Pilot media network** — contacts Press Pilot has sourced/enriched,
   shown to the customer as anonymised recommendations, and charged per selected
   send using a prepaid credit.

The system never sells or exports the Press Pilot network as a downloadable list. It sells
**relevance and managed delivery**. Customers keep full ownership and visibility of contacts
they upload themselves.

This extends the existing story lifecycle (submit → draft → approve → distribute → report)
rather than becoming a separate product area. It builds on functionality that already exists
in this repo:

- `orgs/{orgId}/outletLists/{outletListId}/recipients/{recipientId}` — customer-owned contacts,
  already supported via CSV import (`src/components/outlets/csv-import-dialog.tsx`).
- `platform/{docId}` — platform-wide config readable by any signed-in user, already used for
  vertical/theme taxonomy (`src/components/admin/theme-taxonomy-card.tsx`,
  `src/components/admin/vertical-categories-card.tsx`).
- `context.auth.token.superAdmin` custom claim, already checked in
  `functions/src/super-admin.ts` (`requireSuperAdmin`).
- `orgs/{orgId}/sendJobs/{sendJobId}` — existing send/campaign model.

## Documents in this set

| File | Contents |
|---|---|
| [`data-model-and-security.md`](./data-model-and-security.md) | Firestore collections, TypeScript type sketches, and the Firestore security-rule additions |
| [`import-wizard-and-credits.md`](./import-wizard-and-credits.md) | CSV/XLSX import + mapping wizard, taxonomy, and the credit ledger mechanics |
| [`implementation-plan.md`](./implementation-plan.md) | Phased tickets and acceptance criteria |

## Decisions locked (do not relitigate without a product discussion)

1. **Working name:** Smart Distribution.
2. **Customer-facing language:** "editorial focus" and "recent coverage" — not "beat" (kept only
   as an internal import alias) and not "journalist database".
3. **Ownership rule:** customer-uploaded contacts stay visible, editable and exportable by that
   organisation. Press Pilot-network contacts stay anonymised and are never exported or directly
   queryable by a customer.
4. **Distribution rule:** customers actively select recommended contacts before every send.
   No autonomous sending.
5. **Commercial rule:** Press Pilot-network sends consume prepaid credits; customer-owned sends
   never consume credits.
6. **Credit fairness:** a credit is only spent once a network contact is selected **and** the
   send is accepted for delivery. Hard bounces and Press Pilot-side delivery failures auto-refund.
   No refund for "delivered but no reply/coverage" — Smart Distribution sells relevant, managed
   distribution, not guaranteed coverage.
7. **No cross-customer visibility.** One organisation's uploaded contacts, relationship history
   and outcomes are never surfaced to another organisation. Only de-identified, aggregated
   product learning may inform matching improvements.
8. **Human-in-the-loop first.** No fully automatic sending in the MVP. Press Pilot may also
   manually review early network-recommendation sends before launch of self-serve matching.
9. **Sector-neutral model.** All taxonomy and copy must work for DMOs, Chambers/BIDs, trade
   bodies, charities and sports bodies — not just tourism.

## Out of scope for this PR

This PR adds specification documents only. No Firestore schema, security rules, Cloud
Functions or UI are changed here. Implementation happens in the phases described in
[`implementation-plan.md`](./implementation-plan.md), each as its own reviewable PR against
this branch.
