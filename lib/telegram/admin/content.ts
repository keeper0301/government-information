// ============================================================
// 텔레그램 어드민 명령 — /publish (blog / preview / indexnow).
// ============================================================
// 사장님 모바일에서 콘텐츠 즉시 트리거. Phase 4 — 콘텐츠 트리거.
//
// 노출 endpoint (모두 CRON_SECRET 인증):
//   /api/publish-blog            POST { category?, dryRun? }
//   /api/indexnow-submit-recent  POST
//
// 봇은 응답 본문을 텔레그램 친화적으로 슬라이스 (제목·카테고리·URL).
// ============================================================
import { SITE_BASE } from "./utils";

interface PublishBlogResp {
  message?: string;
  slug?: string;
  title?: string;
  category?: string;
  tags?: string[];
  url?: string;
  // dryRun 만 포함되는 필드들
  meta_description?: string;
  // error 응답
  error?: string;
  detail?: string;
}

interface IndexNowResp {
  timestamp?: string;
  blog_count?: number;
  news_count?: number;
  total_urls?: number;
  results?: unknown;
  submitted?: number;
  note?: string;
  error?: string;
}

// /publish blog [카테고리] — 즉시 발행 (DB 저장)
export async function publishBlogCommand(
  args: string,
  cronSecret: string,
): Promise<string> {
  return callPublishBlog(args, false, cronSecret);
}

// /publish preview [카테고리] — dryRun (DB 저장 안 함, 미리보기)
export async function publishPreviewCommand(
  args: string,
  cronSecret: string,
): Promise<string> {
  return callPublishBlog(args, true, cronSecret);
}

async function callPublishBlog(
  category: string,
  dryRun: boolean,
  cronSecret: string,
): Promise<string> {
  const body: Record<string, unknown> = {};
  const cat = category.trim();
  if (cat) body.category = cat;
  if (dryRun) body.dryRun = true;

  let res: Response;
  try {
    res = await fetch(`${SITE_BASE}/api/publish-blog`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return `❌ publish-blog 호출 실패: ${(e as Error).message.slice(0, 80)}`;
  }
  const data = (await res.json().catch(() => null)) as PublishBlogResp | null;
  if (!data) return `❌ 응답 파싱 실패 (HTTP ${res.status})`;
  if (!res.ok) {
    return `❌ 발행 실패 (HTTP ${res.status})\n${(data.detail ?? data.error ?? "").slice(0, 200)}`;
  }
  const lines = [
    dryRun ? "✅ 미리보기 완료 (DB 저장 안 함)" : "✅ 발행 완료",
    `제목: ${(data.title ?? "?").slice(0, 60)}`,
    `카테고리: ${data.category ?? "?"}`,
    `태그: ${(data.tags ?? []).slice(0, 5).join(", ") || "(없음)"}`,
  ];
  if (!dryRun && data.url) {
    lines.push(`URL: ${SITE_BASE}${data.url}`);
  }
  if (dryRun && data.meta_description) {
    lines.push("");
    lines.push(`설명: ${data.meta_description.slice(0, 200)}`);
  }
  return lines.join("\n");
}

// /publish indexnow — 최근 24h 발행 글 색인 ping (네이버 + Bing + Yandex)
export async function publishIndexnowCommand(
  cronSecret: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${SITE_BASE}/api/indexnow-submit-recent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (e) {
    return `❌ indexnow 호출 실패: ${(e as Error).message.slice(0, 80)}`;
  }
  const data = (await res.json().catch(() => null)) as IndexNowResp | null;
  if (!data) return `❌ 응답 파싱 실패 (HTTP ${res.status})`;
  if (!res.ok) {
    return `❌ ping 실패 (HTTP ${res.status})\n${(data.error ?? "").slice(0, 200)}`;
  }
  if (data.submitted === 0 || data.total_urls === 0) {
    return `✅ ping skip — ${data.note ?? "최근 24h 발행 글 없음"}`;
  }
  return [
    "✅ IndexNow ping 완료",
    `blog ${data.blog_count ?? 0} + news ${data.news_count ?? 0} = ${data.total_urls ?? 0} URL`,
    "네이버·Bing·Yandex 색인 큐 진입.",
  ].join("\n");
}
