// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendOpsAlertMultichannel } from '../../../lib/notifications/ops-alert-multichannel';

const alert = { subject: '[test]', message: 'ops alert', link: '' };

beforeEach(() => {
  vi.stubEnv('OPS_ALERT_DISABLE_SMS', 'false');
  vi.stubEnv('SOLAPI_API_KEY', 'test-key');
  vi.stubEnv('SOLAPI_API_SECRET', 'test-secret');
  vi.stubEnv('SOLAPI_OPS_FROM_PHONE', '01012345678');
  vi.stubEnv('SOLAPI_OPS_TO_PHONE', '01087654321');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_CHAT_ID', '123');
  vi.stubEnv('TELEGRAM_OWNER_CHAT_IDS', '');
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mockChannels(sms: Response | Error, telegramOk = true) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === 'https://api.solapi.com/messages/v4/send') {
      if (sms instanceof Error) throw sms;
      return sms;
    }
    if (url === 'https://api.telegram.org/bottest-token/sendMessage') {
      return Response.json(telegramOk
        ? { ok: true, result: { message_id: 7 } }
        : { ok: false, description: 'Forbidden' }, { status: telegramOk ? 200 : 403 });
    }
    throw new Error('Unexpected request');
  }));
}

describe('SMS failure does not erase Telegram delivery or diagnostics', () => {
  it('retains a message-level sender rejection even when an ID is present', async () => {
    mockChannels(Response.json({ messageId: 'M-rejected', statusCode: '1062', statusMessage: '발신번호 미등록' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.anyDelivered).toBe(true);
    expect(result.sms).toMatchObject({ ok: false, reason: 'api_error', error: expect.stringContaining('1062') });
  });

  it.each([400, 200])('retains a sender rejection with Telegram success (HTTP %s)', async status => {
    // Synthetic provider rejection; do not assume an expiry-specific code.
    mockChannels(Response.json({ errorCode: 'SenderRejected', errorMessage: 'sender registration expired' }, { status }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.anyDelivered).toBe(true);
    expect(result.telegram?.ok).toBe(true);
    expect(result.sms).toMatchObject({ ok: false, reason: 'api_error', error: expect.stringContaining('SenderRejected') });
    expect(warn).toHaveBeenCalledWith('[ops-alert] SMS failed', expect.objectContaining({ reason: 'api_error', error: expect.stringContaining('expired'), telegramOk: true }));
  });

  it('does not accept an empty HTTP 200 response as a successful submission', async () => {
    mockChannels(Response.json({}));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.anyDelivered).toBe(true);
    expect(result.sms).toMatchObject({ ok: false, reason: 'api_error' });
  });

  it('masks configured phone numbers and API credentials in provider errors', async () => {
    mockChannels(Response.json({ errorCode: 'SenderRejected', errorMessage: '010-1234-5678 01087654321 test-key test-secret' }, { status: 400 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.sms).toMatchObject({ ok: false, reason: 'api_error', error: expect.stringContaining('SenderRejected') });
    const diagnostics = JSON.stringify([result.sms, warn.mock.calls]);
    for (const secret of ['010-1234-5678', '01087654321', 'test-key', 'test-secret']) expect(diagnostics).not.toContain(secret);
  });

  it('keeps Telegram delivery when SMS network access fails', async () => {
    mockChannels(new Error('fetch failed'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.anyDelivered).toBe(true);
    expect(result.sms).toMatchObject({ ok: false, reason: 'network_error', error: 'fetch failed' });
  });

  it('reports no delivery when both channels fail', async () => {
    mockChannels(Response.json({ errorCode: 'SenderRejected' }, { status: 400 }), false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.anyDelivered).toBe(false);
    expect(result.sms?.ok).toBe(false);
    expect(result.telegram?.ok).toBe(false);
  });

  it('preserves the disabled-SMS policy without an SMS failure warning', async () => {
    vi.stubEnv('OPS_ALERT_DISABLE_SMS', 'true');
    mockChannels(new Error('SMS must not be called'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.anyDelivered).toBe(true);
    expect(result.sms).toEqual({ ok: false, reason: 'skipped_disabled' });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    { response: { messageId: 'M-test', groupId: 'G-test', statusCode: '2000' }, id: 'M-test' },
    { response: { messageId: 'M-legacy' }, id: 'M-legacy' },
    { response: { groupId: 'G-legacy' }, id: 'G-legacy' },
  ])('preserves a successful API submission ($id)', async ({ response, id }) => {
    mockChannels(Response.json(response));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendOpsAlertMultichannel(alert);
    expect(result.anyDelivered).toBe(true);
    expect(result.sms).toEqual({ ok: true, messageId: id });
    expect(warn).not.toHaveBeenCalled();
  });
});
