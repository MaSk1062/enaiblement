#!/usr/bin/env bash
#
# One-time GCP setup. Idempotent — safe to re-run.
#
#   ./scripts/setup-gcp.sh
#
# Needs project-admin rights (enabling APIs, creating a service account, granting IAM).
# If you are not an owner on the project, hand this to whoever is.
#
# There is no API key and no Secret Manager entry anywhere in this: both Gemini and Firestore
# are reached with Application Default Credentials.

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && { set -a; . ./.env; set +a; }

PROJECT="${GCP_PROJECT_ID:?GCP_PROJECT_ID is not set — see .env.example}"
REGION="${DEPLOY_REGION:-us-central1}"
REPO="${DEPLOY_REPO:-enaible}"
DB="${FIRESTORE_DATABASE_ID:-(default)}"
DIMS="${EMBEDDING_DIMENSIONS:-768}"
SA_NAME="enaible-run"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

echo "==> Enabling APIs on ${PROJECT}"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  --project "$PROJECT"

echo "==> Artifact Registry repo '${REPO}' in ${REGION}"
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" \
       --repository-format=docker --location "$REGION" --project "$PROJECT" \
       --description="enaible container images"

echo "==> Runtime service account ${SA}"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA_NAME" \
       --project "$PROJECT" --display-name="enaible Cloud Run runtime"

# Exactly the two roles ARCHITECTURE.md §8.3 specifies, and nothing else.
for ROLE in roles/aiplatform.user roles/datastore.user; do
  echo "==> Granting ${ROLE} to the runtime service account"
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA}" --role="$ROLE" --condition=None --quiet >/dev/null
done

# Local development uses YOUR credentials, not the service account, so you need the same two.
CALLER="$(gcloud config get-value account 2>/dev/null)"
if [ -n "$CALLER" ] && [ "$CALLER" != "(unset)" ]; then
  for ROLE in roles/aiplatform.user roles/datastore.user; do
    echo "==> Granting ${ROLE} to ${CALLER} (for local dev via ADC)"
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="user:${CALLER}" --role="$ROLE" --condition=None --quiet >/dev/null
  done
fi

# The vector index takes minutes to build and every RAG query fails until it exists, so it is
# created here rather than at demo time. --database matters: the schema spec's command assumes
# "(default)" and this project's database is not necessarily that.
echo "==> Firestore vector index on knowledge_base (database: ${DB}, ${DIMS} dimensions)"
gcloud alpha firestore indexes composite create \
  --project "$PROJECT" \
  --database "$DB" \
  --collection-group=knowledge_base \
  --query-scope=COLLECTION \
  --field-config field-path=industry,order=ASCENDING \
  --field-config "field-path=embedding,vector-config={\"dimension\":\"${DIMS}\",\"flat\":{}}" \
  2>&1 | grep -v "already exists" || true

cat <<NOTE

==> Done. Two things gcloud cannot do for you:

  1. Firebase console > Authentication > Get started.
     Turn on the Email/Password and Google providers, or every sign-in fails with
     auth/configuration-not-found.

  2. After the first deploy, add the Cloud Run domain to
     Firebase Auth > Settings > Authorized domains.

Then:  node scripts/verify-kickoff.mjs   # confirms models respond
       ./scripts/deploy.sh               # builds and ships
NOTE
