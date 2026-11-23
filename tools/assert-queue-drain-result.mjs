// Fail CI when a queue-drain cron returns HTTP 200 with an application failure.
// Print only bounded, non-secret counters; never echo an untrusted response body.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function inspectQueueDrain(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'invalid_result' };
  }
  const counters = {};
  for (const key of ['fetched', 'classified', 'failed', 'updated', 'llm_failed', 'update_failed']) {
    if (Number.isSafeInteger(data[key]) && data[key] >= 0) counters[key] = data[key];
  }
  const reason = typeof data.stop_reason === 'string'
    ? data.stop_reason.slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '')
    : undefined;
  return {
    ok: data.ok === true,
    reason: data.ok === false ? 'application_failure' : data.ok === true ? undefined : 'missing_ok',
    ...(reason ? { stop_reason: reason } : {}),
    ...counters,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  const label = process.argv[3] || 'queue drain';
  if (!file) {
    console.error('::error::queue drain response path required');
    process.exitCode = 1;
  } else {
    try {
      const result = inspectQueueDrain(readFileSync(file, 'utf8'));
      console.log(JSON.stringify(result));
      if (!result.ok) {
        console.error(`::error::${label} returned ${result.reason || 'application_failure'} (HTTP may be 200)`);
        process.exitCode = 1;
      }
    } catch {
      console.error(`::error::${label} response unreadable`);
      process.exitCode = 1;
    }
  }
}
