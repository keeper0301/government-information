// Date-only application deadlines use the Korean calendar, independent of server TZ.
export function validApplicationDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function applicationDaysLeft(value: string | null | undefined, now = new Date()): number | null {
  const date = validApplicationDate(value);
  if (!date) return null;
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}

export function isApplicationClosed(value: string | null | undefined, now = new Date()): boolean {
  const days = applicationDaysLeft(value, now);
  return days !== null && days < 0;
}
