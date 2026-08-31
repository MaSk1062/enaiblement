#!/usr/bin/env bash
#
# Log-based metrics, one alert, one dashboard. Idempotent - safe to re-run.
#
#   ./scripts/monitoring.sh
#
# Run once, after the first deploy. Everything here reads the structured events the app already
# writes to stdout (app/services/telemetry.ts), so there is no agent to install, no exporter to
# keep alive, and nothing extra in the container.
#
# Set ALERT_EMAIL to be notified when turns start failing. Without it the metrics and dashboard
# are still created and the alert is skipped.

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && { set -a; . ./.env; set +a; }

PROJECT="${GCP_PROJECT_ID:?GCP_PROJECT_ID is not set - see .env.example}"
SERVICE="${DEPLOY_SERVICE:-enaible}"
BASE="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\""

echo "==> Log-based metrics on ${PROJECT}"

# create-or-update, because `create` fails on the second run and `update` on the first.
metric() {
  local NAME="$1" DESC="$2" FILTER="$3"
  if gcloud logging metrics describe "$NAME" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud logging metrics update "$NAME" --project "$PROJECT" \
      --description="$DESC" --log-filter="$FILTER" --quiet >/dev/null
    echo "    updated ${NAME}"
  else
    gcloud logging metrics create "$NAME" --project "$PROJECT" \
      --description="$DESC" --log-filter="$FILTER" --quiet >/dev/null
    echo "    created ${NAME}"
  fi
}

# A metric that measures rather than counts. gcloud takes no flags for these - a distribution
# needs metricKind, valueType, a value extractor and bucket options, and the only way in is a
# config file.
dist_metric() {
  local NAME="$1" DESC="$2" FILTER="$3" FIELD="$4" UNIT="$5"
  local FILE="/tmp/${NAME}.yaml"

  cat > "$FILE" <<YAML
name: ${NAME}
description: ${DESC}
filter: ${FILTER}
valueExtractor: EXTRACT(jsonPayload.${FIELD})
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: "${UNIT}"
bucketOptions:
  exponentialBuckets:
    numFiniteBuckets: 20
    growthFactor: 2
    scale: 1
YAML

  if gcloud logging metrics describe "$NAME" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud logging metrics update "$NAME" --project "$PROJECT" \
      --config-from-file="$FILE" --quiet >/dev/null
    echo "    updated ${NAME}"
  else
    gcloud logging metrics create "$NAME" --project "$PROJECT" \
      --config-from-file="$FILE" --quiet >/dev/null
    echo "    created ${NAME}"
  fi
}

# A turn that ended badly. This is the one that matters: the user lost their message.
metric enaible_turn_failures "Chat turns that failed" \
  "${BASE} AND jsonPayload.event=\"turn.end\" AND jsonPayload.ok=false"

# A repair means the model returned output that did not match its schema and had to be asked
# again. Recoverable, double cost, and one bad roll from a lost turn - so it is a leading
# indicator of R1/R2 rather than an error.
metric enaible_schema_repairs "Agent responses that needed a schema repair" \
  "${BASE} AND jsonPayload.event=\"agent.repair\""

# The gate holding is normal. The gate holding forever is the deadlock the Canvas fixed.
metric enaible_stage_blocked "Turns blocked at the approval gate" \
  "${BASE} AND jsonPayload.event=\"stage.blocked\""

# The cost meter, per turn.
dist_metric enaible_turn_tokens "Tokens per chat turn" \
  "${BASE} AND jsonPayload.event=\"turn.end\"" totalTokens "1"

# End-to-end turn latency, which is what the user actually experiences.
dist_metric enaible_turn_latency "Chat turn latency in ms" \
  "${BASE} AND jsonPayload.event=\"turn.end\"" durationMs "ms"

if [ -n "${ALERT_EMAIL:-}" ]; then
  echo "==> Alert policy (turn failures) -> ${ALERT_EMAIL}"

  CHANNEL="$(gcloud alpha monitoring channels list --project "$PROJECT" \
    --filter="labels.email_address=${ALERT_EMAIL}" --format='value(name)' 2>/dev/null | head -1)"

  if [ -z "$CHANNEL" ]; then
    CHANNEL="$(gcloud alpha monitoring channels create --project "$PROJECT" \
      --display-name="enaible alerts" --type=email \
      --channel-labels="email_address=${ALERT_EMAIL}" --format='value(name)')"
  fi

  # One policy, not five. A demo needs a tripwire, not a pager rotation.
  if ! gcloud alpha monitoring policies list --project "$PROJECT" \
       --filter='displayName="enaible: chat turns failing"' --format='value(name)' | grep -q .; then
    cat > /tmp/enaible-alert.json <<JSON
{
  "displayName": "enaible: chat turns failing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "More than 3 failed turns in 5 minutes",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/enaible_turn_failures\" AND resource.type=\"cloud_run_revision\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 3,
      "duration": "0s",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM" }]
    }
  }],
  "notificationChannels": ["${CHANNEL}"]
}
JSON
    gcloud alpha monitoring policies create --project "$PROJECT" \
      --policy-from-file=/tmp/enaible-alert.json --quiet >/dev/null
    echo "    created"
  else
    echo "    already exists"
  fi
else
  echo "==> Skipping alert policy (set ALERT_EMAIL to enable)"
fi

echo "==> Dashboard"
DASH_TITLE="enaible"

tile() { # $1 title, $2 metric, $3 aligner
  cat <<JSON
{
  "title": "$1",
  "xyChart": {
    "dataSets": [{
      "timeSeriesQuery": {
        "timeSeriesFilter": {
          "filter": "metric.type=\"logging.googleapis.com/user/$2\" AND resource.type=\"cloud_run_revision\"",
          "aggregation": { "alignmentPeriod": "300s", "perSeriesAligner": "$3" }
        }
      },
      "plotType": "LINE"
    }]
  }
}
JSON
}

cat > /tmp/enaible-dashboard.json <<JSON
{
  "displayName": "${DASH_TITLE}",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      { "width": 6, "height": 4, "xPos": 0, "yPos": 0, "widget": $(tile "Turn latency p95 (ms)" enaible_turn_latency ALIGN_PERCENTILE_95) },
      { "width": 6, "height": 4, "xPos": 6, "yPos": 0, "widget": $(tile "Failed turns" enaible_turn_failures ALIGN_SUM) },
      { "width": 6, "height": 4, "xPos": 0, "yPos": 4, "widget": $(tile "Schema repairs" enaible_schema_repairs ALIGN_SUM) },
      { "width": 6, "height": 4, "xPos": 6, "yPos": 4, "widget": $(tile "Tokens per turn (mean)" enaible_turn_tokens ALIGN_MEAN) }
    ]
  }
}
JSON

EXISTING="$(gcloud monitoring dashboards list --project "$PROJECT" \
  --filter="displayName=\"${DASH_TITLE}\"" --format='value(name)' 2>/dev/null | head -1)"

if [ -n "$EXISTING" ]; then
  echo "    already exists: ${EXISTING}"
else
  gcloud monitoring dashboards create --project "$PROJECT" \
    --config-from-file=/tmp/enaible-dashboard.json --quiet >/dev/null
  echo "    created"
fi

cat <<NOTE

==> Done.

  Dashboard:  https://console.cloud.google.com/monitoring/dashboards?project=${PROJECT}
  Logs:       https://console.cloud.google.com/logs/query?project=${PROJECT}

  Log-based metrics only count entries written AFTER the metric exists, so the charts stay
  empty until the next turn. Send one to fill them.

  Queries worth knowing: docs/RUNBOOK.md
NOTE
