import { describe, expect, it } from 'vitest';
import { inspectQueueDrain } from '../../tools/assert-queue-drain-result.mjs';

describe('post-scrape queue drain status', () => {
  it('accepts a successful classification response', () => {
    expect(inspectQueueDrain('{"ok":true,"fetched":200,"classified":200,"failed":0}')).toEqual({
      ok: true, fetched: 200, classified: 200, failed: 0,
    });
  });
  it('rejects HTTP 200 when the app reports rate-limit failures', () => {
    expect(inspectQueueDrain('{"ok":false,"fetched":200,"classified":0,"failed":5,"stop_reason":"rate_limited","errors":["private error"]}')).toEqual({
      ok: false, reason: 'application_failure', stop_reason: 'rate_limited', fetched: 200, classified: 0, failed: 5,
    });
  });
  it('fails closed for malformed or missing result, without leaking response text', () => {
    expect(inspectQueueDrain('<html>secret</html>')).toEqual({ ok: false, reason: 'invalid_json' });
    expect(inspectQueueDrain('{"fetched":1}')).toEqual({ ok: false, reason: 'missing_ok', fetched: 1 });
  });
});
