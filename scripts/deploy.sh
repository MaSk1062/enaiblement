#!/usr/bin/env bash
#
# Build the container on Cloud Build and roll it out to Cloud Run.
#
#   ./scripts/deploy.sh
#
# Reads config from .env. Run scripts/setup-gcp.sh once first — this script assumes the
# Artifact Registry repo and the runtime service account already exist.
#
# Cloud Run settings follow ARCHITECTURE.md §8.3 — concurrency 80, 1 vCPU / 1 GiB, scale to
# zero — with one change: the request timeout is 300s, not 60s. A structured turn can spend
# 1.5-4s generating, double that after a repair re-prompt, plus ~15s of retry backoff before
# the fifth attempt. 60s cuts the request off mid-turn and the user loses their message. The
# session survives either way (a stage only advances on a persisted payload) but the turn
# does not. Override with DEPLOY_TIMEOUT.
#
# Set --min-instances=1 for the hour around a live demo (see the note at the bottom) so the
# first turn does not eat a cold start.

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && { set -a; . ./.env; set +a; }

PROJECT="${GCP_PROJECT_ID:?GCP_PROJECT_ID is not set — see .env.example}"
REGION="${DEPLOY_REGION:-us-central1}"
SERVICE="${DEPLOY_SERVICE:-enaible}"
REPO="${DEPLOY_REPO:-enaible}"
RUN_SA="${DEPLOY_SERVICE_ACCOUNT:-enaible-run@${PROJECT}.iam.gserviceaccount.com}"

# The client bundle is useless without these, and the failure is silent — the deployed login
# page just says Firebase is not configured. Fail loudly here instead.
: "${VITE_FIREBASE_API_KEY:?VITE_FIREBASE_API_KEY is not set}"
: "${VITE_FIREBASE_AUTH_DOMAIN:?VITE_FIREBASE_AUTH_DOMAIN is not set}"
: "${VITE_FIREBASE_PROJECT_ID:?VITE_FIREBASE_PROJECT_ID is not set}"

TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
git diff --quiet 2>/dev/null || TAG="${TAG}-dirty"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:${TAG}"

echo "==> Building ${IMAGE}"
gcloud builds submit \
  --project "$PROJECT" \
  --config cloudbuild.yaml \
  --substitutions "_IMAGE=${IMAGE},_VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY},_VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN},_VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}"

# Runtime config only. No credentials: the service account supplies ADC for both Gemini and
# Firestore, so there is no key to set here and no Secret Manager entry to mount.
ENV_VARS="GCP_PROJECT_ID=${PROJECT}"
ENV_VARS="${ENV_VARS},FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID:-(default)}"
ENV_VARS="${ENV_VARS},FIREBASE_AUTH_PROJECT_ID=${FIREBASE_AUTH_PROJECT_ID:-${PROJECT}}"
ENV_VARS="${ENV_VARS},GEMINI_EMBEDDING_MODEL=${GEMINI_EMBEDDING_MODEL:-gemini-embedding-001}"

# The model and its endpoint are a pair (gemini-3.5-flash is global-only) and their defaults
# live in app/services/gemini.ts. Passed through only when .env sets them — a second copy of a
# default here is a second place for it to drift, and it is the place it drifted last time.
# `if`, not `[ … ] && …`: under `set -e` a false test is a failing command and would abort here.
if [ -n "${GEMINI_TEXT_MODEL:-}" ]; then
  ENV_VARS="${ENV_VARS},GEMINI_TEXT_MODEL=${GEMINI_TEXT_MODEL}"
fi
if [ -n "${GCP_LOCATION:-}" ]; then
  ENV_VARS="${ENV_VARS},GCP_LOCATION=${GCP_LOCATION}"
fi
ENV_VARS="${ENV_VARS},EMBEDDING_DIMENSIONS=${EMBEDDING_DIMENSIONS:-768}"
ENV_VARS="${ENV_VARS},RAG_TOP_K=${RAG_TOP_K:-3}"
ENV_VARS="${ENV_VARS},MAX_TURNS_PER_MINUTE=${MAX_TURNS_PER_MINUTE:-20}"

echo "==> Deploying ${SERVICE} to ${REGION}"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --image "$IMAGE" \
  --service-account "$RUN_SA" \
  --allow-unauthenticated \
  --set-env-vars "${ENV_VARS}" \
  --cpu 1 --memory 1Gi \
  --concurrency 80 \
  --timeout "${DEPLOY_TIMEOUT:-300}" \
  --min-instances 0 --max-instances 10

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"

echo "==> Health check"
if curl -fsS "${URL}/health"; then
  echo
  echo "==> Live at ${URL}"
  echo "    Add this domain to Firebase Auth > Settings > Authorized domains, or sign-in fails:"
  echo "    ${URL#https://}"
  echo "    Before a demo: gcloud run services update ${SERVICE} --region ${REGION} --min-instances 1"
else
  echo
  echo "!!  /health did not return 200. Logs:"
  echo "    gcloud run services logs read ${SERVICE} --project ${PROJECT} --region ${REGION} --limit 50"
  exit 1
fi
