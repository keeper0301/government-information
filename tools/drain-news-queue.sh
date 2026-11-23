#!/usr/bin/env bash
# One request only: no retries, and never print response strings or credentials.
set -euo pipefail
path="${1:-}"
case "$path" in
  /api/cron/news-classify|/api/cron/news-ai-commentary-backfill) ;;
  *) echo "::error::Unsupported news drain"; exit 1 ;;
esac
if [ -z "${CRON_SECRET:-}" ] || [ -z "${SITE_BASE_URL:-}" ]; then
  echo "::error::News drain configuration missing"
  exit 1
fi
out="$(mktemp)" || { echo "::error::Cannot create drain response file"; exit 1; }
trap 'rm -f "$out"' EXIT
http=$(curl -sS --request POST --max-time 780 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -o "$out" -w "%{http_code}" "${SITE_BASE_URL}${path}") || {
  echo "::error::News drain request failed"
  exit 1
}
case "$http" in
  [0-9][0-9][0-9]) echo "HTTP $http" ;;
  *) echo "::error::Invalid HTTP status"; exit 1 ;;
esac
diagnostic_failed=0
node - "$out" "$path" <<'NODE' || diagnostic_failed=1
const fs = require('fs');
try {
  const json = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error();
  const safe = {};
  if (typeof json.ok === 'boolean') safe.ok = json.ok;
  const counters = ['duration_ms', 'fetched', 'classified', 'auto_hidden', 'kept', 'failed',
    'updated', 'sentinel_filled', 'llm_failed', 'update_failed'];
  for (const key of counters) {
    if (Number.isSafeInteger(json[key]) && json[key] >= 0) safe[key] = json[key];
  }
  if (json.stop_reason !== undefined) {
    const allowed = ['credit_exhausted', 'insufficient_quota', 'authentication', 'permission'];
    safe.stop_reason = allowed.includes(json.stop_reason) ? json.stop_reason : 'unknown';
  }
  if (json.skipped === 'OPENAI_API_KEY missing') safe.skipped = 'missing_api_key';
  console.log(JSON.stringify(safe));
  // updated includes sentinel writes; sentinel_filled is a subset, not extra progress.
  const keys = ['fetched', 'updated', 'sentinel_filled', 'llm_failed', 'update_failed'];
  const valid = keys.every(key => Number.isSafeInteger(json[key]) && json[key] >= 0);
  if (process.argv[3] === '/api/cron/news-ai-commentary-backfill' && valid
    && json.fetched > 0 && json.updated === 0 && json.sentinel_filled === 0
    && json.llm_failed + json.update_failed > 0
    && json.llm_failed + json.update_failed <= json.fetched) {
    console.error('::error::Commentary attempts made no progress');
    process.exitCode = 1;
  }
} catch {
  console.error('::error::News drain diagnostics failed');
  process.exitCode = 1;
}
NODE
if ! rm -f "$out"; then
  echo "::error::Cannot remove drain response file"
  exit 1
fi
trap - EXIT
if [ "$diagnostic_failed" -ne 0 ]; then
  echo "::error::News drain diagnostic process failed"
  exit 1
fi
case "$http" in
  2[0-9][0-9]) ;;
  *) echo "::error::News drain returned non-2xx HTTP status"; exit 1 ;;
esac
