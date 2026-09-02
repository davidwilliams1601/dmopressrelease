# Email Whitelabelling Plan

Status: **proposed** · Owner: David Williams · Last updated: 2026-09-02

## 1. Where we are today

All Press Pilot mail sends through a single SendGrid-authenticated domain. Org
identity is expressed only as a **display name** plus (since PR #26) a
**Reply-To**:

```
From:     Visit Kent <press@[press-pilot sender domain]>
Reply-To: Visit Kent <sophie@visitkent.co.uk>
```

There is no per-org sending domain, no SendGrid subuser, and no per-org
DKIM/SPF. A recipient who expands the headers sees Press Pilot.

Two further leaks that domain authentication alone will **not** fix:

- **Click/open tracking** is enabled on the release send (`index.ts`) and
  `sendPartnerEmail`. SendGrid rewrites every link through `sendgrid.net`, so
  hovering a link in a "Visit Kent" press release shows a Press Pilot-shaped
  tracking URL. Fixing this needs **Link Branding**, which is a separate
  SendGrid feature from Domain Authentication.
- **Tier attribution** in the email footer is separate again and already
  handled (`email-branding.ts`).

## 2. What "whitelabelled" needs to mean

For a DMO to say "our press releases come from us", four things must be true:

| # | Requirement | Mechanism |
|---|---|---|
| 1 | `From` is on the org's domain | SendGrid Domain Authentication |
| 2 | Passes SPF/DKIM/DMARC as that domain | 3 CNAMEs on the org's DNS |
| 3 | Tracked links are on the org's domain | SendGrid Link Branding |
| 4 | No Press Pilot attribution in body/footer | Already done (tier-gated) |

Only 1–3 are outstanding.

## 3. Key finding: we do not need subusers

The obvious design is one SendGrid subuser per customer. **Recommend against it
for v1.**

- Subuser management requires the SendGrid **Pro** plan at ~$89.95/mo, up from
  Essentials ([SendGrid pricing analysis](https://www.emailsoftwareinsights.com/reviews/sendgrid/pricing/)),
  and via the UI a parent account can assign only **one domain per subuser**,
  with up to five via API ([SendGrid support](https://support.sendgrid.com/hc/en-us/articles/12591936887579-Assign-authenticated-domains-to-subusers)).
- A single SendGrid user can hold up to **3,000 authenticated domains** and
  **3,000 link brandings** ([Domain Authentication docs](https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication)).

3,000 domains on one account covers Press Pilot's addressable market many times
over. So: **authenticate many domains under one account and select the right
`from` per send.** No plan upgrade needed to ship whitelabelling.

Subusers become worth revisiting later, for reputation isolation and per-org
dedicated IPs (§7), not for identity.

## 4. Phases

### Phase 0 — sender-identity fixes (done, PR #26)

Reply-To across all member-facing sends, monthly impact report no longer
spoofs the org's address in `from`, Enterprise attribution fixed. Introduced
`functions/src/sender.ts` as the single place `from`/`replyTo` are built —
every later phase changes that one helper.

### Phase 1 — data model

Add to the org document:

```ts
sending?: {
  domain?: string;              // "visitkent.co.uk"
  subdomain?: string;           // "em" → em.visitkent.co.uk
  fromLocalPart?: string;       // "press" → press@visitkent.co.uk
  fromName?: string;            // overrides org.name if set
  sendgridDomainId?: number;    // whitelabel/domains id
  sendgridLinkId?: number;      // whitelabel/links id
  dns?: Array<{ host: string; type: 'cname'; data: string; valid: boolean }>;
  status: 'none' | 'pending' | 'verified' | 'failed';
  lastCheckedAt?: Timestamp;
  verifiedAt?: Timestamp;
  failureReason?: string;
}
```

`status` is the only field the send path reads. Firestore rules: org admins
read; **writes server-side only** — a client that can write `sending.status`
can make us send as any domain.

### Phase 2 — provisioning functions

Three callables, superadmin + org-admin gated:

- `provisionSendingDomain({ orgId, domain, subdomain })` →
  `POST /v3/whitelabel/domains` with `automatic_security: true` (yields 3
  CNAMEs; `false` gives 2 TXT + 1 MX, which is more for a customer to get
  wrong). Stores the returned DNS records, sets `status: 'pending'`.
- `checkSendingDomainStatus({ orgId })` → `POST /v3/whitelabel/domains/{id}/validate`.
  On success sets `verified`. Also run on a schedule for `pending` orgs, with
  backoff, and give up after ~14 days into `failed`.
- `provisionLinkBranding({ orgId })` → `POST /v3/whitelabel/links`, same
  pattern. Run only once domain auth verifies, to keep the customer's DNS work
  to a single batch.

Validation to enforce before calling SendGrid: domain is a registrable public
domain, not a public email provider (gmail/outlook/yahoo), not already claimed
by another org, and not Press Pilot's own.

### Phase 3 — settings UI

A "Sending domain" card under Settings, tier-gated:

1. Enter domain → we show the 3 CNAMEs with copy buttons and a "send to my IT
   team" action.
2. Persistent status banner: Pending / Verified / Failed with the specific
   error.
3. "Check now" button hitting `checkSendingDomainStatus`.

DNS is the real adoption bottleneck here. A DMO comms lead usually cannot add
CNAMEs themselves — it goes to council IT or an agency. The copy needs to be
forwardable as-is, and we should expect days, not minutes.

### Phase 4 — send path

Change `orgSender()` only:

```ts
if (org.sending?.status === 'verified') {
  from = { email: `${localPart}@${org.sending.domain}`, name: fromName };
  // Reply-To now optional but keep it — press contact ≠ sending mailbox
} else {
  // existing platform sender + Reply-To
}
```

Rules:
- **Fail safe.** Anything other than `verified` falls back to the platform
  sender. Never send as an unverified domain.
- **Platform mail stays platform mail.** Password reset, welcome, support, and
  billing must keep sending from Press Pilot's domain — a customer's domain
  vouching for our password reset is both wrong and a phishing pattern.
  `password-reset.ts`, `welcome-email.ts`, `support.ts`, `billing.ts` should not
  use `orgSender()` at all.
- Set `trackingSettings.subscriptionTracking` and link branding per org so
  tracked links follow the sending domain.

### Phase 5 — unsubscribe and compliance

Worth pulling forward regardless of whitelabelling. The journalist release
email currently has no unsubscribe link, just "please contact us"
(`index.ts` `formatEmailHtml`). Once we send as the customer's domain, their
domain carries the complaint burden, so this gets sharper:

- Add `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
- Add a real one-click unsubscribe honoured per org.
- Scope suppression lists per org — one DMO's unsubscribe must not silently
  suppress a journalist for every other DMO, and vice versa.

### Phase 6 — rollout

1. Ship behind a superadmin-only flag; authenticate one domain we control.
2. Pilot with Visit Kent (Starter, LVEP push) or Auris Tech (Enterprise,
   already whitelabel-entitled and currently mislabelled until PR #26 ships).
3. Watch bounce/complaint/deferral rates on the new domain for 2 weeks —
   a brand-new sending domain has no reputation and will throttle initially.
4. Open to Organisation + Enterprise tiers.

## 5. Reputation risk (the real one)

Every org shares Press Pilot's IP reputation. Today that is hidden behind our
domain. After Phase 4 the org's *domain* reputation is theirs, but the *IP*
reputation is still pooled — so one customer blasting a stale journalist list
degrades deliverability for everyone, and we will get the support ticket.

Mitigations, cheapest first:

- Per-org send volume caps and a hard cap on recipients per release.
- Bounce-rate circuit breaker: auto-pause an org's sending above a threshold.
- List hygiene at import — reject role addresses and obvious junk.
- Only then: Pro plan, subusers, dedicated IPs (~$30/mo per extra IP,
  [SendGrid support](https://support.sendgrid.com/hc/en-us/articles/9237413560219-Dedicated-IP-Addresses)).
  A dedicated IP needs sustained volume to warm properly, so this is likely
  wrong for a single DMO and right only for large federated Enterprise trees.

## 6. Commercial framing

Whitelabelling is already sold as an Organisation/Enterprise feature via the
tier config, but only as *visual* whitelabelling. Two options:

- **Keep it inside the existing tiers.** Simplest, honours what the tier
  descriptions already imply, and the DNS friction naturally limits uptake.
- **Charge for the sending domain separately.** Defensible — it is real
  provisioning and deliverability support cost — but risks a "we already paid
  for whitelabel" argument from Organisation customers.

Recommend the first, and treat sending-domain setup as a white-glove onboarding
step for Enterprise.

## 7. Sequencing recommendation

Phase 1–4 is the shippable core and is roughly a week of focused work; the
SendGrid API surface is small and `sender.ts` already isolates the change.

Phase 5 (unsubscribe/compliance) is the one I would not defer. It is a live
gap today — cold press outreach at volume with no unsubscribe mechanism is a
PECR/GDPR exposure that whitelabelling makes materially worse by putting the
customer's own domain behind it.

## 8. Open questions

1. Do we let orgs choose the local part (`press@`, `news@`) or fix it? Fixing
   it is simpler and less support load.
2. Federated orgs (§ Auris Tech): does a child org inherit the parent's sending
   domain, or authenticate its own? Inheritance is almost certainly what
   customers expect, and needs deciding before Phase 1's data model is set.
3. Do we ever need to receive replies in-platform? If so, Reply-To has to point
   at an inbound-parse address instead of the press contact, which conflicts
   with what PR #26 just fixed. Worth settling before building further.
