// ============================================================
// Content Security Policy helpers
// ============================================================
// Enforced CSP is compatibility-first for inline Next.js/bootstrap scripts, but
// production report-only data showed no unsafe-eval dependency. Keep report-only
// active to catch future third-party drift.

const BASE_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://*.tosspayments.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://www.googletagmanager.com https://*.googletagmanager.com https://*.adtrafficquality.google",
  "frame-src 'self' https://*.tosspayments.com https://googleads.g.doubleclick.net https://*.googlesyndication.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const SCRIPT_SOURCES = [
  "'self'",
  "'unsafe-inline'",
  "https://pagead2.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://*.googleadservices.com",
  "https://*.googletagmanager.com",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://js.tosspayments.com",
];

export function buildContentSecurityPolicy(): string {
  return [
    "script-src " + SCRIPT_SOURCES.join(" "),
    ...BASE_DIRECTIVES,
  ].join("; ");
}

export function buildReportOnlyContentSecurityPolicy(): string {
  return [
    "script-src " + SCRIPT_SOURCES.join(" "),
    ...BASE_DIRECTIVES,
    "report-uri /api/csp-report",
  ].join("; ");
}
