import { getRegisteredUsersDashboard, userOpsStatusLabel, type RegisteredUserDashboardRow } from "@/lib/admin/users-dashboard";

export type ContactReminderItem = {
  userId: string;
  email: string;
  opsStatus: string;
  nextContactAt: string;
  note: string;
  adminUrl: string;
  daysOverdue: number;
};

export type ContactReminderDigest = {
  today: string;
  dueToday: ContactReminderItem[];
  overdue: ContactReminderItem[];
  totalDue: number;
};

export type ContactReminderSummary = {
  today: string;
  totalDue: number;
  dueToday: number;
  overdue: number;
};

const DEFAULT_BASE_URL = "https://www.keepioo.com";
const MAX_MESSAGE_ITEMS = 15;

export function kstDateString(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function buildContactReminderDigest(input: {
  rows: RegisteredUserDashboardRow[];
  today?: string;
  baseUrl?: string;
}): ContactReminderDigest {
  const today = input.today ?? kstDateString();
  const baseUrl = (input.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const dueToday: ContactReminderItem[] = [];
  const overdue: ContactReminderItem[] = [];

  for (const row of input.rows) {
    if (!row.nextContactAt || row.opsStatus === "done") continue;
    if (row.nextContactAt > today) continue;

    const item: ContactReminderItem = {
      userId: row.userId,
      email: row.email ?? "(이메일 없음)",
      opsStatus: userOpsStatusLabel(row.opsStatus),
      nextContactAt: row.nextContactAt,
      note: row.opsNote ?? "",
      adminUrl: `${baseUrl}/admin/users/${row.userId}`,
      daysOverdue: daysBetween(row.nextContactAt, today),
    };
    if (row.nextContactAt === today) dueToday.push(item);
    else overdue.push(item);
  }

  const byDateThenEmail = (a: ContactReminderItem, b: ContactReminderItem) =>
    a.nextContactAt.localeCompare(b.nextContactAt) || a.email.localeCompare(b.email);
  dueToday.sort(byDateThenEmail);
  overdue.sort(byDateThenEmail);

  return {
    today,
    dueToday,
    overdue,
    totalDue: dueToday.length + overdue.length,
  };
}

export async function collectContactReminderDigest(input?: {
  today?: string;
  baseUrl?: string;
}): Promise<ContactReminderDigest> {
  const dashboard = await getRegisteredUsersDashboard();
  return buildContactReminderDigest({
    rows: dashboard.rows,
    today: input?.today,
    baseUrl: input?.baseUrl,
  });
}

export function summarizeContactReminderDigest(digest: ContactReminderDigest): ContactReminderSummary {
  return {
    today: digest.today,
    totalDue: digest.totalDue,
    dueToday: digest.dueToday.length,
    overdue: digest.overdue.length,
  };
}

export function formatContactReminderText(digest: ContactReminderDigest): string {
  const lines = [
    `📞 오늘 연락할 사용자 요약 (${digest.today})`,
    `총 ${digest.totalDue}명 · 오늘 ${digest.dueToday.length}명 · 기한 지남 ${digest.overdue.length}명`,
    "",
  ];

  if (digest.totalDue === 0) {
    lines.push("오늘 연락 예정인 사용자가 없습니다.", "", "관리: https://www.keepioo.com/admin/users");
    return lines.join("\n");
  }

  appendSection(lines, "오늘 연락", digest.dueToday);
  appendSection(lines, "기한 지남", digest.overdue);

  const hidden = digest.totalDue - Math.min(digest.totalDue, MAX_MESSAGE_ITEMS);
  if (hidden > 0) {
    lines.push("", `외 ${hidden}명은 관리자 페이지에서 확인해 주세요.`);
  }
  lines.push("", "관리: https://www.keepioo.com/admin/users?ops=waiting_response");
  return lines.join("\n");
}

export function buildContactReminderEmail(digest: ContactReminderDigest): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `[keepioo] 오늘 연락할 사용자 ${digest.totalDue}명`;
  const text = formatContactReminderText(digest);
  const html = `
    <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#172033">
      <h1 style="font-size:20px;margin:0 0 8px">오늘 연락할 사용자 요약</h1>
      <p style="margin:0 0 16px;color:#667085">${escapeHtml(digest.today)} · 총 <b>${digest.totalDue}</b>명 · 오늘 ${digest.dueToday.length}명 · 기한 지남 ${digest.overdue.length}명</p>
      ${renderHtmlSection("오늘 연락", digest.dueToday)}
      ${renderHtmlSection("기한 지남", digest.overdue)}
      ${digest.totalDue === 0 ? "<p>오늘 연락 예정인 사용자가 없습니다.</p>" : ""}
      <p style="margin-top:20px"><a href="https://www.keepioo.com/admin/users?ops=waiting_response">관리자 페이지에서 보기</a></p>
    </div>
  `;
  return { subject, text, html };
}

function appendSection(lines: string[], title: string, items: ContactReminderItem[]) {
  if (items.length === 0) return;
  lines.push(`■ ${title}`);
  for (const item of items.slice(0, MAX_MESSAGE_ITEMS - countRendered(lines))) {
    const overdue = item.daysOverdue > 0 ? ` · ${item.daysOverdue}일 지남` : "";
    lines.push(`- ${item.email} · ${item.opsStatus} · ${item.nextContactAt}${overdue}`);
    if (item.note) lines.push(`  메모: ${truncate(item.note, 80)}`);
    lines.push(`  ${item.adminUrl}`);
  }
  lines.push("");
}

function countRendered(lines: string[]): number {
  return lines.filter((line) => line.startsWith("- ")).length;
}

function renderHtmlSection(title: string, items: ContactReminderItem[]): string {
  if (items.length === 0) return "";
  return `
    <h2 style="font-size:16px;margin:18px 0 8px">${escapeHtml(title)}</h2>
    <ul style="padding-left:18px;margin-top:0">
      ${items
        .map(
          (item) => `
            <li style="margin-bottom:12px">
              <b>${escapeHtml(item.email)}</b> · ${escapeHtml(item.opsStatus)} · ${escapeHtml(item.nextContactAt)}${item.daysOverdue > 0 ? ` · ${item.daysOverdue}일 지남` : ""}<br />
              ${item.note ? `<span style="color:#667085">메모: ${escapeHtml(truncate(item.note, 180))}</span><br />` : ""}
              <a href="${escapeHtml(item.adminUrl)}">상세 보기</a>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.floor((toMs - fromMs) / 86_400_000));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
