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
