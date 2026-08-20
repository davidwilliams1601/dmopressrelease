# Import Wizard & Credit Mechanics

## 1. Customer contact import

Today's CSV import (`src/components/outlets/csv-import-dialog.tsx`) uses a fixed column set:
`name, email, outlet, position, notes`. Smart Distribution needs a mapping wizard so a
customer's existing spreadsheet — whatever its column names — imports without reformatting.

### Flow

1. **Upload** — any CSV or XLSX. Read header row + a sample of rows.
2. **Auto-map + suggest** — match headers to Press Pilot fields by exact name, then by alias
   table (below), then leave unmatched columns as "Internal notes" or "Ignore".
3. **Review mapping** — user can change or skip any suggested mapping before import.
4. **Validate** — before writing anything:
   - valid / ready to import
   - missing or invalid email
   - possible duplicate (existing email match within the org's contacts)
   - already suppressed / do-not-contact
   - unmapped columns retained as notes or dropped
5. **Confirm import** — nothing is written to Firestore until this step.
6. **Save mapping profile (optional)** — store the column→field mapping against the
   organisation so recurring exports (e.g. monthly CRM export) map automatically next time.

### Field alias table (import-time normalisation)

| Press Pilot field | Common aliases to recognise |
|---|---|
| `editorialFocus` | beat, specialism, sector, coverage, what they cover |
| `geography` | region, area, coverage area, location |
| `topics` | interests, subjects, keywords |
| `outletType` | publication type, media type |
| `relationshipStatus` | status, relationship, stage |
| `lastContactedAt` | last emailed, last contacted, last pitch date |
| `doNotContact` | opt out, do not pitch, unsubscribe |
| `notes` | comments, internal notes |

`beat` is a first-class alias, not a supported customer-facing field name — the UI always
labels the mapped result "Editorial focus".

### Downloadable template

```csv
first_name,last_name,email,outlet,role,editorial_focus,geography,topics,outlet_type,last_contacted,relationship_notes,do_not_contact
Jane,Smith,jane@example-times.co.uk,Example Times,Travel Editor,"independent retail, high-street regeneration","Kent, South East England","retail, town centres",local-news,2026-05-12,"Covered our members before; prefers exclusives",false
```

Ship this alongside a short field guide (plain-English description of each column) as a
second sheet or linked help page, per the earlier decision to explain `editorial_focus` and
`geography` in non-newsroom language.

## 2. Superadmin media network import

Same wizard mechanics, run from the admin console (`/admin` or `/dashboard/admin`), with two
required additions before any row can be published to `mediaNetworkContacts`:

1. **Source & rights** — mandatory selection per batch: Press Pilot research / licensed
   provider / partner-contributed / publicly sourced / other (+ required note). Stored as
   `provenance.sourceType` / `sourceReference`.
2. **Review queue** — rows are held at `networkStatus: 'review'` until a superadmin approves
   them; nothing becomes recommendable (`active`) automatically.

Deduplication against the network runs first at import time, then again at recommendation
time against each organisation's own uploaded contacts (see acceptance criteria in
`implementation-plan.md`) — a customer should never receive an anonymised network
recommendation for someone they already have listed by name.

## 3. Controlled taxonomy

Editorial focus, geography, outlet type and topics are all controlled taxonomy IDs, following
the existing pattern in `theme-taxonomy-card.tsx` / `vertical-categories-card.tsx`, stored in
`platform/mediaTaxonomy` and readable by any signed-in user. New terms can be proposed during
import ("we didn't recognise 'Sustainability & ESG' — add it to the taxonomy?") but are only
written by a superadmin-approved action, keeping the vocabulary consistent across all
organisations and therefore usable for matching.

## 4. Credit ledger mechanics

### What a credit buys

One credit = one accepted delivery to a Press Pilot-network contact, selected by the customer
for a specific story send. Browsing recommendations, viewing rationale, excluding a
recommendation, and sending to the organisation's own contacts never cost a credit.

### Ledger, not a balance field

```ts
export type CreditTransaction = {
  id: string;
  orgId: string;
  type: 'purchase' | 'included_allowance' | 'grant' | 'adjustment' | 'usage'
      | 'refund' | 'expiry' | 'reversal' | 'migration';
  quantity: number;              // positive or negative
  balanceAfter: number;
  reasonCode: string;
  reasonNote?: string;
  campaignId?: string;           // required for usage / refund
  createdBy: string;             // 'system' or a superadmin uid
  createdAt: Date | any;
  expiresAt?: Date | any;
  idempotencyKey: string;
};
```

`orgs/{orgId}/creditWallet/summary` caches `balanceAfter` of the latest transaction purely for
fast reads; the ledger in `creditTransactions` is the source of truth and is never edited or
deleted, only appended to (including reversals, which add an offsetting entry rather than
mutating history).

### Consumption sequence

A credit is debited only once, in this order, per selected network contact:

1. Customer reviews the anonymised rationale.
2. Customer selects the recommendation for the send.
3. Customer confirms the campaign send.
4. Press Pilot's delivery layer accepts the message for that recipient.

If a contact is suppressed, opted out, frequency-capped, or fails validation before send, no
credit is charged. If the campaign is cancelled before dispatch, no credit is charged.

### Refund rules

| Event | Credit outcome |
|---|---|
| Hard bounce | Automatic refund |
| Press Pilot-side delivery failure | Automatic refund |
| Suppressed / excluded before send | Never charged |
| Cancelled before dispatch | Never charged |
| Delivered, no reply/coverage | No refund (Smart Distribution sells relevant, managed distribution — not guaranteed coverage) |
| Soft bounce / delayed delivery | Credit held, resolved automatically once final status known |

### Superadmin actions (all produce a ledger entry, none silently overwrite a balance)

| Action | Ledger `type` | Notes |
|---|---|---|
| Grant promotional credits | `grant` | e.g. design-partner incentive, must include reason + optional expiry |
| Add purchased pack | `purchase` | Triggered once payment confirmed |
| Issue refund | `refund` | Tied to a `campaignId` |
| Correct balance | `adjustment` | Mandatory reason note; for migrations/errors |
| Set/change expiry | — | Updates `expiresAt` on the relevant grant, not a new debit |
| Reverse a transaction | `reversal` | Adds an offsetting entry; original stays in history |
| Suspend Smart Distribution | — | Org-level flag, not a ledger entry; stops network recommendations/sends |

There is deliberately no literal "reset credits" action — a top-up for a new pilot customer is
a labelled `grant` (e.g. "100 launch credits — Smart Distribution design partner, valid until
30 Nov 2026"), so the wallet history stays transparent and auditable to the customer and to
Press Pilot.

## 5. Recommendation preview (cost visibility before spend)

Before a customer commits credits, show counts and match bands without revealing identity:

> We found 18 relevant recommended contacts — 11 strong matches, 5 good matches, 2 possible.
> Selecting 12 contacts will use 12 Smart Distribution credits when this campaign sends.

This is generated from `recommendationSnapshots` for the story/campaign, combining eligible
`Recipient` (customer-owned, 0 credits) and eligible `MediaNetworkContact` entries (1 credit
each), deduplicated so a network contact is never shown if the org already has that same
person as a named contact.
