#!/usr/bin/env bash
# Deploy Firebase functions and restore the public IAM binding on handleSendGridWebhook.
#
# Firebase Gen 1 replaces the IAM policy on every deploy, wiping any manually
# added allUsers binding. This script re-applies it automatically after each deploy.
#
# Usage:
#   ./deploy.sh               — deploy all functions
#   ./deploy.sh --all         — deploy functions + firestore rules + storage rules + indexes
#   ./deploy.sh --only <svc>  — pass-through to firebase deploy (e.g. --only functions:processSendJob)

set -euo pipefail

PROJECT="dmo-press-release"
FUNCTION="handleSendGridWebhook"
REGION="us-central1"

# ── Preflight ─────────────────────────────────────────────────────────────────
# The IAM restore below is not optional. Firebase Gen 1 wipes the allUsers
# binding on every deploy of $FUNCTION, so if gcloud is missing we would deploy,
# strip the binding, and only then fail at the restore step — silently killing
# SendGrid open/click/bounce ingestion until someone noticed. Check up front and
# refuse to start, so the failure is loud and nothing is broken by it.
for tool in firebase gcloud; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: '$tool' is not installed or not on PATH." >&2
    echo "" >&2
    if [[ "$tool" == "gcloud" ]]; then
      echo "gcloud is required to restore the public IAM binding on $FUNCTION after" >&2
      echo "deploying. Without it this script would leave the SendGrid webhook" >&2
      echo "unreachable and stop all open/click/bounce tracking." >&2
      echo "" >&2
      echo "Install it:  brew install --cask google-cloud-sdk" >&2
      echo "Then:        gcloud auth login && gcloud config set project $PROJECT" >&2
      echo "" >&2
      echo "To deploy without touching $FUNCTION in the meantime, bypass this script" >&2
      echo "and name the functions explicitly, e.g.:" >&2
      echo "  firebase deploy --project $PROJECT --only functions:processSendJob" >&2
    fi
    exit 1
  fi
done

# ── Determine what to deploy ──────────────────────────────────────────────────
if [[ "${1:-}" == "--all" ]]; then
  DEPLOY_TARGET=""          # no --only flag → deploy everything
elif [[ "${1:-}" == "--only" && -n "${2:-}" ]]; then
  DEPLOY_TARGET="--only ${2}"
else
  DEPLOY_TARGET="--only functions"
fi

echo "==> Building functions…"
(cd functions && npm run build)

echo ""
echo "==> Deploying to Firebase project: $PROJECT"
# shellcheck disable=SC2086
firebase deploy $DEPLOY_TARGET --project "$PROJECT"

echo ""
echo "==> Restoring public IAM binding on $FUNCTION…"
gcloud functions add-iam-policy-binding "$FUNCTION" \
  --region="$REGION" \
  --member="allUsers" \
  --role="roles/cloudfunctions.invoker" \
  --project="$PROJECT" \
  --quiet

echo ""
echo "✓ Done. $FUNCTION is publicly accessible."
