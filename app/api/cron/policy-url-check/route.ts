// ============================================================
// /api/cron/policy-url-check — 정책 source URL 404 자동 감지
// ============================================================
// 매주 월요일 04:00 KST cron. welfare_programs · loan_programs 의
// apply_url 50건 HEAD 검증 → policy_url_check_log insert. dead 가
// 5건 이상이면 텔레그램 알림 (사장님 100% 자동화 안전망).
//
// 정책:
// - HEAD 우선, 405 응답 시 GET 폴백
// - 10s timeout (느린 정부 site 고려)
// - 30 row × 2 type (welfare + loan) = 60 HEAD 동시 병렬
// - is_dead = 4xx/5xx/timeout/DNS 실패
//
// DDL 088_policy_url_check_log.sql 적용 후 가동.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-actions";
import { authorizeCronRequest } from "@/lib/cron-auth";

// 사장님 텔레그램 알림 (naver-publish cron 패턴 동일). env 없으면 silent.
async function alertTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHECK_BATCH = 30; // welfare + loan 각각 30 → 총 60
const CONCURRENCY = 10; // 동시 호출 cap — 정부 site throttling 회피 (codex P2 fix)
const TIMEOUT_MS = 10_000;
const ALERT_THRESHOLD = 5; // dead ≥ 5 → 텔레그램 알림

// soft-404 감지 marker (codex P2 fix). 정부 site 가 200 OK + HTML "삭제됨"
// 흔한 패턴. body 일부만 fetch (10KB cap) 후 키워드 검사.
const SOFT_404_MARKERS = [
  "페이지를 찾을 수 없",
  "삭제된 페이지",
  "존재하지 않는",
  "not found",
  "page not found",
  "404",
];

// error 분류 — DB·텔레그램에 URL/query string leak 차단 (codex P2 fix).
function normalizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("abort") || lower.includes("timeout")) return "timeout";
  if (lower.includes("enotfound") || lower.includes("dns")) return "dns_error";
  if (lower.includes("invalid url") || lower.includes("err_invalid_url")) return "invalid_url";
  if (lower.includes("certificate") || lower.includes("cert")) return "tls_error";
  if (lower.includes("connect") || lower.includes("econnrefused")) return "connect_error";
  return "fetch_failed";
}

type ProgramRow = { id: string; apply_url: string };
type CheckResult = {
  program_id: string;
  program_type: "welfare" | "loan";
  apply_url: string;
  status_code: number | null;
  is_dead: boolean;
  error_message: string | null;
};

async function checkUrl(url: string): Promise<{
  status_code: number | null;
  is_dead: boolean;
  error_message: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    // 405 Method Not Allowed → GET fallback (정부 site 가 HEAD 차단하는 경우 많음)
    if (resp.status === 405) {
      resp = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
      });
    }
    const status = resp.status;
    const httpDead = status >= 400;
    if (httpDead) {
      return { status_code: status, is_dead: true, error_message: `http_${status}` };
    }
    // soft-404 감지 — 2xx 인데 body 에 "삭제됨"/"not found" 같은 marker
    // (codex P2 fix). HEAD 응답엔 body 없어 GET 1회 추가 (10KB cap).
    if (resp.status >= 200 && resp.status < 300) {
      try {
        const getResp = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
          headers: { Range: "bytes=0-10239" },
        });
        const text = (await getResp.text()).toLowerCase();
        const matched = SOFT_404_MARKERS.find((m) => text.includes(m.toLowerCase()));
        if (matched) {
          return { status_code: status, is_dead: true, error_message: "soft_404" };
        }
      } catch {
        // GET 실패 시 HEAD 결과만 신뢰
      }
    }
    return { status_code: status, is_dead: false, error_message: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status_code: null,
      is_dead: true,
      error_message: normalizeError(msg), // URL/query leak 차단 (codex P2 fix)
    };
  } finally {
    clearTimeout(timer);
  }
}

// 동시 호출 cap — 60 URL 을 10개씩 chunk 처리 (codex P2 fix).
async function checkAllConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function fetchPrograms(
  admin: ReturnType<typeof createAdminClient>,
  type: "welfare" | "loan",
  limit: number,
): Promise<ProgramRow[]> {
  const table = type === "welfare" ? "welfare_programs" : "loan_programs";
  const { data, error } = await admin
    .from(table)
    .select("id, apply_url")
    .not("apply_url", "is", null)
    .neq("apply_url", "")
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    console.error(`[policy-url-check] fetch ${type} fail:`, error.message);
    return [];
  }
  return (data ?? []) as ProgramRow[];
}

export async function GET(request: Request) {
  // Vercel cron 인증 — env 누락 시 명시 500 (Bearer undefined 통과 차단, codex P1 fix)
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const [welfare, loan] = await Promise.all([
    fetchPrograms(admin, "welfare", CHECK_BATCH),
    fetchPrograms(admin, "loan", CHECK_BATCH),
  ]);

  const targets: Array<{ row: ProgramRow; type: "welfare" | "loan" }> = [
    ...welfare.map((row) => ({ row, type: "welfare" as const })),
    ...loan.map((row) => ({ row, type: "loan" as const })),
  ];

  if (targets.length === 0) {
    return NextResponse.json({ status: "no_targets" });
  }

  // 60 URL HEAD/GET — concurrency cap 10 으로 throttling 회피 (codex P2 fix)
  const results: CheckResult[] = await checkAllConcurrent(
    targets,
    async ({ row, type }) => {
      const r = await checkUrl(row.apply_url);
      return {
        program_id: row.id,
        program_type: type,
        apply_url: row.apply_url,
        ...r,
      };
    },
    CONCURRENCY,
  );

  // policy_url_check_log 일괄 insert
  const { error: insertError } = await admin
    .from("policy_url_check_log")
    .insert(results);
  if (insertError) {
    console.error("[policy-url-check] log insert fail:", insertError.message);
  }

  const deadCount = results.filter((r) => r.is_dead).length;
  const okCount = results.length - deadCount;

  // admin_actions audit — system actor (cron) 이라 actorId=null
  await logAdminAction({
    actorId: null,
    action: "policy_url_check_run",
    details: { checked: results.length, dead: deadCount, ok: okCount },
  }).catch((e) =>
    console.error("[policy-url-check] audit fail:", e?.message),
  );

  // 사장님 텔레그램 알림 (사장님 100% 자동화 안전망 — dead 5건 이상이면)
  if (deadCount >= ALERT_THRESHOLD) {
    const deadList = results
      .filter((r) => r.is_dead)
      .slice(0, 10)
      .map((r) => `- ${r.program_type}/${r.program_id}: ${r.error_message ?? "?"}`)
      .join("\n");
    await alertTelegram(
      `🔗 정책 source URL ${deadCount}건 dead 감지\n\n${deadList}${
        deadCount > 10 ? `\n... 외 ${deadCount - 10}건` : ""
      }\n\nhttps://www.keepioo.com/admin/autonomous 에서 확인`,
    ).catch((e) =>
      console.error("[policy-url-check] telegram alert fail:", e?.message),
    );
  }

  return NextResponse.json({
    status: "ok",
    checked: results.length,
    dead: deadCount,
    ok_count: okCount,
    alert_sent: deadCount >= ALERT_THRESHOLD,
  });
}
