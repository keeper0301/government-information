// ============================================================
// 텔레그램 어드민 명령 — /press (pending list / confirm / dismiss).
// ============================================================

import {
  listPressCandidates,
  confirmPressCandidate,
  rejectPressCandidate,
} from "@/lib/press-ingest/candidates";
import { isUuid, uuidUsage } from "./utils";

// /press — pending 5개 list (confirm·dismiss 명령 prefill 포함)
export async function pressListCommand(): Promise<string> {
  const rows = await listPressCandidates(5);
  if (rows.length === 0) return "✅ pending press 후보 없음 (큐 깨끗)";
  return [
    `[press pending — ${rows.length}건]`,
    "",
    ...rows.map(
      (r, i) =>
        `${i + 1}. ${(r.title ?? "").slice(0, 40)}\n   /press confirm ${r.id}\n   /press dismiss ${r.id}`,
    ),
  ].join("\n");
}

// /press confirm {uuid}
export async function pressConfirmCommand(uuid: string): Promise<string> {
  if (!isUuid(uuid)) return uuidUsage("/press confirm");
  try {
    const r = await confirmPressCandidate(uuid, null);
    return `✅ 등록 완료\ntable: ${r.table}\nprogram_id: ${r.id}`;
  } catch (e) {
    return `❌ 등록 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

// /press dismiss {uuid}
export async function pressDismissCommand(uuid: string): Promise<string> {
  if (!isUuid(uuid)) return uuidUsage("/press dismiss");
  try {
    await rejectPressCandidate(uuid, null);
    return `✅ 후보 폐기 완료 (${uuid.slice(0, 8)}...)`;
  } catch (e) {
    return `❌ 폐기 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}
