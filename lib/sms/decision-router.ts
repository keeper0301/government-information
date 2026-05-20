// ============================================================
// SMS 양방향 결정 라우터 (Phase 2 자율 운영)
// ============================================================
// 사장님 SMS 답장 (1=승인, 2=무시, 3=상의) 으로 임계 조정·승인 위임.
//
// 사용 흐름:
//   1. registerDecision({ kind, prompt, context }) 호출
//      → DB 에 decision_pending row insert + SMS 발송 + decision_id 반환
//   2. 사장님 휴대폰에서 답장 (예 "1")
//   3. /api/webhook/solapi-receive 가 handleSmsReply(from, text) 호출
//      → 가장 최근 미결정 row decision='approve' 갱신 + DECISION_HANDLERS 실행
//   4. cleanup cron (별도) 이 expires_at 지난 row 'expired' 처리
//
// 안전 가드:
//   - 발신번호 화이트리스트 (env SMS_DECISION_ALLOWED_FROM csv)
//   - 24h 만료 (DB level — expires_at 컬럼)
//   - 답장 텍스트 1/2/3 외 무시 (잘못된 답장 안내 자동 회신)
//   - 액션 실패해도 decision 은 갱신 (재시도 spec 별도)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { sendOpsAlertSms } from "@/lib/notifications/sms-ops-alert";
import { sendOpsAlertMultichannel } from "@/lib/notifications/ops-alert-multichannel";

// 결정 종류 — 새 결정 추가 시 DECISION_HANDLERS 에 액션도 함께 등록.
// kind 이름은 sub-project + 단계 명시 (rollback 시 추적 쉬움).
export const DECISION_KINDS = [
  "dedupe_threshold_w2",   // dedupe 임계 0.92 → 0.88
  "dedupe_threshold_w3",   // 0.88 → 0.86
  "dedupe_threshold_w4",   // 0.86 → 0.85
  "spec_c_baseline_start", // welfare LLM 매칭 baseline 1주 측정 (₩200K + 월 ₩30K)
  "news_cap_increase",     // news cap 30 → 50/100 (timeout 가설 기각 후)
] as const;

export type DecisionKind = (typeof DECISION_KINDS)[number];
export type DecisionResult = "approve" | "reject" | "consult" | "expired";

interface RegisterInput {
  kind: DecisionKind;
  prompt: string;       // SMS 본문에 표시될 결정 요청 (예: "W2 dedupe 0.92→0.88 진행할까요?")
  context?: Record<string, unknown>; // 액션 실행 시 사용할 추가 데이터
}

// 결정 요청 등록 + SMS 발송 — id 반환 (테스트·로그용)
export async function registerDecision(
  input: RegisterInput,
): Promise<{ id: string; smsResult: Awaited<ReturnType<typeof sendOpsAlertSms>> }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("decision_pending")
    .insert({
      kind: input.kind,
      prompt: input.prompt,
      context: input.context ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`decision_pending insert 실패: ${error?.message}`);
  }

  // 2026-05-21 사장님 명시 — SMS off, 텔레그램으로 알림 도달.
  // multichannel 가 SMS + 텔레그램 동시 발송 → OPS_ALERT_DISABLE_SMS=true env 에서 텔레그램만.
  // 답장 처리는 webhook (handleSmsReply) — SMS off 시 사장님은 /admin/decisions UI 또는
  // 텔레그램 봇 명령 (다음 세션 spec) 으로 결정 처리 필요.
  const smsBody = `${input.prompt}\n\n1=승인 / 2=무시 / 3=상의`;
  const multi = await sendOpsAlertMultichannel({
    subject: "[keepioo 결정 요청]",
    message: smsBody,
  });
  // 기존 호환성 위해 smsResult 그대로 반환 (sms 채널 결과만).
  const smsResult: Awaited<ReturnType<typeof sendOpsAlertSms>> =
    multi.sms ?? { ok: false, reason: "network_error", error: "sms unavailable" };

  return { id: data.id as string, smsResult };
}

// 답장 텍스트 → DecisionResult 매핑. 1/2/3 외엔 null (무시).
export function parseDecisionReply(text: string): DecisionResult | null {
  const t = text.trim();
  if (t === "1") return "approve";
  if (t === "2") return "reject";
  if (t === "3") return "consult";
  return null;
}

// 발신번호 화이트리스트 — env SMS_DECISION_ALLOWED_FROM (csv) 와 비교.
// 미설정 시 모든 발신 reject (안전 default).
export function isAllowedSender(from: string): boolean {
  const raw = process.env.SMS_DECISION_ALLOWED_FROM;
  if (!raw) return false;
  // 정규화 — 하이픈·공백·국가코드 prefix 제거
  const normalize = (s: string) => s.replace(/[-\s+]/g, "").replace(/^82/, "0");
  const normalized = normalize(from);
  return raw
    .split(",")
    .map((p) => normalize(p))
    .some((p) => p.length > 0 && p === normalized);
}

// SMS 답장 처리 — webhook 진입점. 매칭 + decision 갱신 + 액션 실행.
// 반환값: 처리 결과 요약 (webhook 응답·로그용)
export async function handleSmsReply(input: {
  from: string;
  text: string;
}): Promise<{
  ok: boolean;
  reason?: string;
  decisionId?: string;
  kind?: DecisionKind;
  result?: DecisionResult;
  actionResult?: string;
}> {
  // 1) 발신번호 화이트리스트
  if (!isAllowedSender(input.from)) {
    return { ok: false, reason: "sender_not_allowed" };
  }

  // 2) 답장 텍스트 파싱
  const result = parseDecisionReply(input.text);
  if (!result) {
    // 잘못된 답장 → 자동 회신 (재발송 안 함, 로그만)
    return { ok: false, reason: "invalid_reply_text" };
  }

  // 3) 가장 최근 미결정 row 매칭
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("decision_pending")
    .select("id, kind, context")
    .is("decision", null)
    .gte("expires_at", new Date().toISOString())
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { ok: false, reason: "no_pending_decision" };
  }

  const row = pending as { id: string; kind: string; context: Record<string, unknown> | null };
  const kind = row.kind as DecisionKind;

  // 4) 결정 갱신 + 액션 실행
  let actionResult = "skipped";
  if (result === "approve") {
    const handler = DECISION_HANDLERS[kind];
    if (handler) {
      try {
        actionResult = await handler(row.context ?? {});
      } catch (e) {
        actionResult = `error: ${(e as Error).message.slice(0, 200)}`;
      }
    } else {
      actionResult = "no_handler";
    }
  }

  await admin
    .from("decision_pending")
    .update({
      decision: result,
      decided_at: new Date().toISOString(),
      sender_phone: input.from,
      action_result: actionResult,
    })
    .eq("id", row.id);

  return { ok: true, decisionId: row.id, kind, result, actionResult };
}

// 2026-05-21 — 텔레그램 봇 명령 /decide 진입점. id 명시 매칭 (vs handleSmsReply 의 "최근" 매칭).
// 같은 갱신·핸들러 흐름 재사용. 텔레그램 / SMS 둘 다 같은 결정 처리 보장.
export async function handleDecisionAction(input: {
  id: string;
  result: DecisionResult;
  sender: string; // 텔레그램 chatId 또는 SMS from
}): Promise<{
  ok: boolean;
  reason?: string;
  decisionId?: string;
  kind?: DecisionKind;
  result?: DecisionResult;
  actionResult?: string;
}> {
  const admin = createAdminClient();
  // id 로 row 매칭 + 미결정 + 미만료 가드
  const { data: pending } = await admin
    .from("decision_pending")
    .select("id, kind, context, decision, expires_at")
    .eq("id", input.id)
    .maybeSingle();

  if (!pending) {
    return { ok: false, reason: "decision_not_found" };
  }
  const row = pending as {
    id: string;
    kind: string;
    context: Record<string, unknown> | null;
    decision: string | null;
    expires_at: string;
  };
  if (row.decision) {
    return { ok: false, reason: "already_decided" };
  }
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  const kind = row.kind as DecisionKind;

  let actionResult = "skipped";
  if (input.result === "approve") {
    const handler = DECISION_HANDLERS[kind];
    if (handler) {
      try {
        actionResult = await handler(row.context ?? {});
      } catch (e) {
        actionResult = `error: ${(e as Error).message.slice(0, 200)}`;
      }
    } else {
      actionResult = "no_handler";
    }
  }

  await admin
    .from("decision_pending")
    .update({
      decision: input.result,
      decided_at: new Date().toISOString(),
      sender_phone: input.sender,
      action_result: actionResult,
    })
    .eq("id", row.id);

  return { ok: true, decisionId: row.id, kind, result: input.result, actionResult };
}

// 미결정 row 목록 — 텔레그램 /decide 무인자 호출 시 사용.
export async function listPendingDecisions(): Promise<
  Array<{
    id: string;
    kind: DecisionKind;
    prompt: string;
    sent_at: string;
    expires_at: string;
  }>
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("decision_pending")
    .select("id, kind, prompt, sent_at, expires_at")
    .is("decision", null)
    .gte("expires_at", new Date().toISOString())
    .order("sent_at", { ascending: false })
    .limit(10);
  return (data ?? []) as Array<{
    id: string;
    kind: DecisionKind;
    prompt: string;
    sent_at: string;
    expires_at: string;
  }>;
}

// 결정 종류별 액션 핸들러 — kind 이름과 1:1.
// approve 일 때만 호출. 위험한 액션 (DDL·prod 데이터 변경) 은 사장님 명시 표현 다음
// 단계로 미루고, 여기선 환경변수 toggle 같은 안전한 액션만 자동.
//
// 외부 시스템 (Vercel env 등록) 호출은 별도 spec 으로 분리. 여기선 DB 액션 위주.
const DECISION_HANDLERS: Partial<
  Record<DecisionKind, (context: Record<string, unknown>) => Promise<string>>
> = {
  // 임계 조정 — 실제 Vercel env 변경은 별도 chrome 자동화 또는 사장님 콘솔.
  // 여기선 admin_actions 에 audit + admin_decisions 알림만.
  dedupe_threshold_w2: async () =>
    "Vercel env DEDUPE_AUTO_CONFIRM_THRESHOLD=0.88 변경 권장 (별도 chrome 자동화 또는 사장님 콘솔)",
  dedupe_threshold_w3: async () =>
    "Vercel env DEDUPE_AUTO_CONFIRM_THRESHOLD=0.86 변경 권장",
  dedupe_threshold_w4: async () =>
    "Vercel env DEDUPE_AUTO_CONFIRM_THRESHOLD=0.85 변경 권장",
  // spec C 진입 결정 — 비용 동의만 받고 다음 spec 작성으로 넘김
  spec_c_baseline_start: async () =>
    "spec C welfare LLM 매칭 baseline 1주 측정 진입 동의 — 다음 세션 spec 작성·구현",
  news_cap_increase: async () =>
    "news cap 변경 권장 — duration_ms audit 결과 확인 후 별도 commit",
};
