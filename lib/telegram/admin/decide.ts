// ============================================================
// 텔레그램 봇 /decide 명령 — 사장님 양방향 결정 처리 (2026-05-21)
// ============================================================
// SMS off 후 결정 답장 채널이 텔레그램으로 옮겨짐. SMS 의 "1=승인 / 2=무시 / 3=상의"
// 패턴을 텔레그램 sub-command 로 노출:
//   /decide                       → 미결정 목록 (가장 최근 10건)
//   /decide approve <id>          → 승인 + 액션 실행 + DB 갱신
//   /decide reject <id>           → 무시 처리
//   /decide consult <id>          → 상의 표시 (액션 X)
//
// id 는 UUID 8자 prefix 매칭 (사장님 입력 부담 ↓). list 에서 copy.
// ============================================================

import {
  handleDecisionAction,
  listPendingDecisions,
  type DecisionResult,
} from "@/lib/sms/decision-router";
import { createAdminClient } from "@/lib/supabase/admin";

export async function decideListCommand(): Promise<string> {
  const pending = await listPendingDecisions();
  if (pending.length === 0) {
    return "✅ 미결정 결정 없음. 모두 처리됐어요.";
  }
  const lines = pending.map((p, i) => {
    const shortId = p.id.slice(0, 8);
    const sentDate = new Date(p.sent_at).toISOString().slice(0, 16).replace("T", " ");
    return `${i + 1}. \`${shortId}\` (${p.kind})\n   ${p.prompt.slice(0, 80)}\n   sent ${sentDate} KST`;
  });
  return [
    `🤔 미결정 ${pending.length}건`,
    "",
    ...lines,
    "",
    "처리: /decide approve|reject|consult {앞 8자 id}",
  ].join("\n");
}

// shortId (8자 prefix) → 정확한 UUID 매칭.
// UUID 9번째 문자는 하이픈 (`-`) 이라 9자+ prefix 는 like 매칭 0 됨 →
// 첫 8자만 사용 (헥스 영역). 중복 가능성 ~0 (UUID 8자 = 2^32 분기).
async function resolveShortId(shortId: string): Promise<string | null> {
  if (shortId.length < 6) return null;
  // 9자+ 입력은 첫 8자만 사용 (UUID 하이픈 위치 회피).
  const prefix = shortId.length > 8 ? shortId.slice(0, 8) : shortId;
  const admin = createAdminClient();
  const { data } = await admin
    .from("decision_pending")
    .select("id")
    .like("id", `${prefix}%`)
    .is("decision", null)
    .limit(2);
  const rows = (data ?? []) as Array<{ id: string }>;
  if (rows.length === 0) return null;
  if (rows.length > 1) return null; // 중복 prefix — list 다시 확인 (사실상 0)
  return rows[0].id;
}

async function decideAction(
  shortId: string,
  result: DecisionResult,
  sender: string,
): Promise<string> {
  const trimmed = shortId.trim();
  if (!trimmed) {
    return "❌ id 필수: /decide approve {8자 id}";
  }
  const fullId = await resolveShortId(trimmed);
  if (!fullId) {
    return `❌ id "${trimmed}" 매칭 0건 또는 중복. /decide 로 목록 다시 확인.`;
  }
  const r = await handleDecisionAction({
    id: fullId,
    result,
    sender: `telegram:${sender}`,
  });
  if (!r.ok) {
    return `❌ 처리 실패 (${r.reason})`;
  }
  const emoji = result === "approve" ? "✅" : result === "reject" ? "🚫" : "💬";
  return [
    `${emoji} ${result} 처리 완료`,
    `kind: ${r.kind}`,
    `id: ${r.decisionId?.slice(0, 8)}`,
    `action: ${r.actionResult ?? "(none)"}`,
  ].join("\n");
}

export const decideApproveCommand = (id: string, sender: string) =>
  decideAction(id, "approve", sender);

export const decideRejectCommand = (id: string, sender: string) =>
  decideAction(id, "reject", sender);

export const decideConsultCommand = (id: string, sender: string) =>
  decideAction(id, "consult", sender);
