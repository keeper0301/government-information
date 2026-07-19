"use client";

// ============================================================
// /admin/auto-confirmed 클라이언트 UI — 필터·일괄 선택·회수/복원
// ============================================================
// 서버에서 받은 rows 를 그대로 렌더하면서 다음 인터랙션 처리:
//  - 1·3·7·30일 윈도우 토글 (Link href ?days=N — 서버 fetch 재실행)
//  - 활성 row 다중 선택 → 일괄 회수 (confirm 다이얼로그 후 진행)
//  - 단건 회수 / 복원 (회수된 row 만 복원 버튼 노출)
// useTransition 으로 액션 진행 중 disable 처리 → 더블클릭 방지.
// ============================================================

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  revokeAction,
  restoreAction,
  bulkRevokeAction,
} from "./actions";
import type { AutoConfirmedRow } from "@/lib/press-ingest/candidates";

function formatKstMinute(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "날짜 없음";

  const kst = new Date(time + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function AutoConfirmedList({
  rows,
  days,
}: {
  rows: AutoConfirmedRow[];
  days: number;
}) {
  // 선택된 candidate_id 집합 (일괄 회수용). 회수된 row 는 선택 불가.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 액션 진행 중 disable — 회수 도중 추가 클릭 차단
  const [pending, startTransition] = useTransition();

  const onToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRevokeOne = (id: string) =>
    startTransition(async () => {
      await revokeAction(id);
    });

  const onRestoreOne = (id: string) =>
    startTransition(async () => {
      await restoreAction(id);
    });

  const onBulkRevoke = () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size}건 회수합니다. 진행할까요?`)) return;
    startTransition(async () => {
      await bulkRevokeAction([...selected]);
      setSelected(new Set());
    });
  };

  return (
    <div>
      {/* 상단 툴바 — 윈도우 필터 + 선택 카운트 + 일괄 회수 버튼 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[1, 3, 7, 30].map((d) => (
          <Link
            key={d}
            href={`?days=${d}`}
            className={`text-sm px-3 py-1.5 rounded-full border ${
              d === days
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-grey-700 border-grey-200"
            }`}
          >
            최근 {d}일
          </Link>
        ))}
        <div className="ml-auto text-xs text-grey-600">
          총 {rows.length}건 (선택 {selected.size})
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onBulkRevoke}
            disabled={pending}
            className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            선택 회수
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-grey-600">자동 등록된 정책 없음.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.candidate_id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                r.is_hidden
                  ? "border-red-200 bg-red-50"
                  : "border-grey-200 bg-white"
              }`}
            >
              {/* 회수된 row 는 일괄 선택 대상이 아니라 체크박스 숨김 */}
              {!r.is_hidden && (
                <input
                  type="checkbox"
                  checked={selected.has(r.candidate_id)}
                  onChange={() => onToggle(r.candidate_id)}
                  className="mt-1"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-grey-600 mb-1 flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      r.auto_confirm_tier === "high"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    🤖 {r.auto_confirm_tier}
                  </span>
                  <span>
                    {r.table === "welfare_programs" ? "복지" : "대출"}
                  </span>
                  <span>·</span>
                  <span>{r.ministry ?? "—"}</span>
                  <span>·</span>
                  <span>{formatKstMinute(r.auto_confirmed_at)}</span>
                  {r.is_hidden && (
                    <span className="text-red-600 font-semibold">회수됨</span>
                  )}
                </div>
                <Link
                  href={`/${
                    r.table === "welfare_programs" ? "welfare" : "loan"
                  }/${r.program_id}`}
                  className="text-sm font-semibold text-grey-900 hover:underline truncate block"
                >
                  {r.title}
                </Link>
              </div>
              {r.is_hidden ? (
                <button
                  type="button"
                  onClick={() => onRestoreOne(r.candidate_id)}
                  disabled={pending}
                  className="text-xs text-blue-600 disabled:opacity-50"
                >
                  복원
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRevokeOne(r.candidate_id)}
                  disabled={pending}
                  className="text-xs text-red-600 disabled:opacity-50"
                >
                  회수
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
