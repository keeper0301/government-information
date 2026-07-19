export function formatAdminNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.trunc(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
