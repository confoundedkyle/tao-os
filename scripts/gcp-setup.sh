#!/usr/bin/env bash
# One-time GCP setup for the GitHub Actions → Cloud Run deploy pipeline.
# Idempotent — safe to re-run; "already exists" errors are tolerated.
set -uo pipefail

PROJECT_ID="gen-lang-client-0340047448"
PROJECT_NUMBER="642702332247"
REGION="europe-west1"
REPO="calyflow"
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
GITHUB_REPO="Calyflow/calyflow-app"
POOL="github"
PROVIDER="github"

run() { echo "+ $*"; "$@" || echo "  (non-zero exit tolerated if resource already exists)"; }

run gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project "$PROJECT_ID"

run gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project "$PROJECT_ID"

run gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions deployer" \
  --project "$PROJECT_ID"

for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

run gcloud iam workload-identity-pools create "$POOL" \
  --location=global \
  --display-name="GitHub Actions" \
  --project "$PROJECT_ID"

run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --location=global \
  --workload-identity-pool="$POOL" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
  --project "$PROJECT_ID"

run gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" \
  --project "$PROJECT_ID"

echo
echo "WIF provider resource (GH var GCP_WIF_PROVIDER):"
gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" \
  --project "$PROJECT_ID" --format="value(name)"
