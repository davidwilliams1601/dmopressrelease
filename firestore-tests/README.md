# Firestore rules tests

Security Rules unit tests for the collections reviewed in the 2026-08-20 Smart
Distribution QA pass (Medium finding M12: "No Firestore rules test suite exists for
any of the reviewed collections").

Covers: `mediaNetworkContacts`, `mediaNetworkImportBatches`,
`orgs/{orgId}/recommendationSnapshots`, `auditLogs/{actorUid}/entries` (the M11 own-trail
fix), `orgs/{orgId}/creditTransactions`, `orgs/{orgId}/creditWallet`,
`orgs/{orgId}/creditReservations`, `orgs/{orgId}/networkContactRefs`,
`orgs/{orgId}/sendJobs` (+ its `recipients` subcollection), and `platform/{docId}`
(the M8 taxonomy read path).

## Running

From the repo root:

```
npm run test:rules
```

This starts the Firestore emulator (via `firebase-tools`, downloaded on demand through
`npx` if not already installed) against `../firestore.rules`, runs the Jest suite in
this folder, then shuts the emulator down. Requires Java (the emulator's runtime) and
network access on first run to fetch the emulator jar and `firebase-tools`.

To run directly against an emulator you've already started yourself (e.g. via
`firebase emulators:start --only firestore` in another terminal), set
`FIRESTORE_EMULATOR_HOST=localhost:8080` and run `npm test` from this folder instead.

## Adding more coverage

This pass intentionally scoped tests to the collections the QA review touched, not the
whole ruleset (e.g. `releases`, `outletLists`, `tags`, `submissions`, `invites` are
untested here). Extend `rules.test.js` with new `describe` blocks following the same
`seed()` / `authenticatedContext()` pattern when those are next revisited.
