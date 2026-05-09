// ============================================================
// 텔레그램 어드민 명령 — /dedupe (list / confirm / reject).
// ============================================================
// baseId 단일 토큰만 받아서 welfare/loan 자동 감지. table+candidateId 는
// 서버에서 row 조회로 복원 — 사장님 모바일에서 1개 UUID 만 입력.

import {
  listDuplicateCandidatesForBot,
  confirmDuplicateForBot,
  rejectDuplicateForBot,
} from "@/lib/dedupe/bot-actions";
import { isUuid, uuidUsage } from "./utils";

// /dedupe — 중복 후보 5개 (점수순) + confirm/reject 명령 prefill
export async function dedupeListCommand(): Promise<string> {
  const rows = await listDuplicateCandidatesForBot(5);
  if (rows.length === 0) return "✅ pending dedupe 후보 없음";
  return [
    `[dedupe pending — ${rows.length}건]`,
    "",
    ...rows.flatMap((r, i) => [
      `${i + 1}. [${r.table === "welfare_programs" ? "w" : "l"}] ${(r.base_title ?? "").slice(0, 30)}`,
      `   ↔ ${(r.candidate_title ?? "").slice(0, 30)}`,
      `   /dedupe confirm ${r.base_id}`,
      `   /dedupe reject ${r.base_id}`,
      "",
    ]),
  ].join("\n");
}

// /dedupe confirm {baseId}
export async function dedupeConfirmCommand(baseId: string): Promise<string> {
  if (!isUuid(baseId)) return uuidUsage("/dedupe confirm");
  try {
    const r = await confirmDuplicateForBot(baseId);
    return `✅ 중복 확정\ntable: ${r.table}\ncandidate_id: ${r.candidateId.slice(0, 8)}...`;
  } catch (e) {
    return `❌ 확정 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

// /dedupe reject {baseId}
export async function dedupeRejectCommand(baseId: string): Promise<string> {
  if (!isUuid(baseId)) return uuidUsage("/dedupe reject");
  try {
    const r = await rejectDuplicateForBot(baseId);
    const prev = r.prevCandidateId
      ? `${r.prevCandidateId.slice(0, 8)}...`
      : "(없음)";
    return `✅ 중복 해제\ntable: ${r.table}\nprev_candidate: ${prev}`;
  } catch (e) {
    return `❌ 해제 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}
