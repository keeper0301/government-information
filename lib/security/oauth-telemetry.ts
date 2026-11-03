// Drop whole OAuth events/transactions: allowlist redaction cannot predict all SDK span fields.
// No Node-only imports: used by both Node and Edge Sentry initialization.
export function shouldDropOAuthTelemetry(event: unknown): boolean {
  const pending: unknown[] = [event];
  const seen = new WeakSet<object>();
  let visited = 0;
  try {
    while (pending.length) {
      if (++visited > 10000) return true;
      const item = pending.pop();
      if (typeof item === 'string') {
        const text = item.toLowerCase();
        if (text.includes('x-keeper-punch-control')) return true;
        if (text.includes('/api/threads/oauth/callback') || text.includes('/api/threads/keeper-punch/oauth/')) return true;
        if (/https:\/\/graph\.threads\.(net|com)\/(?:v\d+\.\d+\/)?(?:oauth\/access_token|access_token|debug_token)(?:[?\/#\s]|$)/.test(text)) return true;
        if (/https:\/\/(?:www\.)?threads\.(net|com)\/oauth\/authorize(?:[?\/#\s]|$)/.test(text)) return true;
      } else if (item !== null && typeof item === 'object' && !seen.has(item)) {
        seen.add(item);
        const entries = Object.entries(item);
        if (entries.length > 10000 || pending.length + entries.length > 10000) return true;
        for (const [key, value] of entries) {
          if (key.toLowerCase().includes('x-keeper-punch-control')) return true;
          pending.push(value);
        }
      }
    }
    return false;
  } catch {
    return true;
  }
}
