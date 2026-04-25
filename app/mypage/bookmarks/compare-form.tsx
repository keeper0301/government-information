"use client";

// ============================================================
// CompareForm — 북마크 페이지에서 2~3개 선택 후 /compare 로 이동
// ============================================================
// 같은 program_type (welfare 끼리 / loan 끼리) 만 비교 가능.
// 선택 개수가 2 미만이거나 3 초과면 비교 버튼 비활성.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import type { BookmarkItem } from "@/lib/bookmarks";

type Props = {
  items: BookmarkItem[];
};

export function CompareForm({ items }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 선택된 항목들의 program_type 추출 (모두 같아야 비교 가능)
  const selectedItems = items.filter((it) =>
    selected.has(`${it.programType}:${it.programId}`),
  );
  const types = new Set(selectedItems.map((it) => it.programType));
  const sameType = types.size === 1;
  const count = selectedItems.length;
  const canCompare = sameType && count >= 2 && count <= 3;
  const selectedType = sameType ? selectedItems[0]?.programType : null;
  const compareHref =
    canCompare && selectedType
      ? `/compare?type=${selectedType}&ids=${selectedItems.map((it) => it.programId).join(",")}`
      : "#";

  function toggle(item: BookmarkItem) {
    const key = `${item.programType}:${item.programId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // 이미 3개면 더 안 추가 (비교 페이지 한도)
        if (next.size >= 3) return prev;
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div>
      {/* 선택 안내 + 비교 버튼 — 페이지 상단 sticky 형태 */}
      <div className="sticky top-[60px] z-10 -mx-5 px-5 py-3 bg-white border-b border-grey-100 mb-4 flex items-center justify-between">
        <p className="text-[13px] text-grey-700">
          {count === 0
            ? "비교할 정책 2~3개를 체크하세요."
            : !sameType
            ? "복지·대출은 함께 비교할 수 없어요."
            : count > 3
            ? "최대 3개까지 비교 가능"
            : `${count}개 선택됨${count < 2 ? " (2개 이상 필요)" : ""}`}
        </p>
        {canCompare ? (
          <Link
            href={compareHref}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white text-[13px] font-semibold no-underline hover:bg-blue-700"
          >
            비교하기 ({count})
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-lg bg-grey-200 px-4 py-2 text-grey-500 text-[13px] font-semibold cursor-not-allowed"
          >
            비교하기
          </button>
        )}
      </div>

      <ul className="divide-y divide-grey-200 border border-grey-200 rounded-2xl bg-white overflow-hidden">
        {items.map((item) => {
          const key = `${item.programType}:${item.programId}`;
          const isChecked = selected.has(key);
          // 다른 타입이 이미 선택됐으면 disable
          const disabled =
            !isChecked &&
            count > 0 &&
            !sameType
              ? false
              : !isChecked &&
                count > 0 &&
                selectedItems[0]?.programType !== item.programType
              ? true
              : !isChecked && count >= 3;
          return (
            <BookmarkRow
              key={key}
              item={item}
              checked={isChecked}
              disabled={disabled}
              onToggle={() => toggle(item)}
            />
          );
        })}
      </ul>
    </div>
  );
}

function BookmarkRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: BookmarkItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const typeLabel = item.programType === "welfare" ? "복지" : "대출";
  const typeColor =
    item.programType === "welfare"
      ? "bg-blue-50 text-blue-600"
      : "bg-green/10 text-green";
  const dday = calcDdayClient(item.applyEnd);

  return (
    <li className={`px-5 py-4 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 w-4 h-4 cursor-pointer accent-blue-600"
          aria-label={`${item.title} 비교 대상에 추가`}
        />
        <Link
          href={`/${item.programType}/${item.programId}`}
          className="flex-1 min-w-0 no-underline block"
        >
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[12px] font-semibold px-2 py-0.5 rounded ${typeColor}`}>
              {typeLabel}
            </span>
            {item.category && (
              <span className="text-[12px] text-grey-600">· {item.category}</span>
            )}
            {item.region && item.region !== "전국" && (
              <span className="text-[12px] text-grey-600">· {item.region}</span>
            )}
            <DdayBadge dday={dday} />
          </div>
          <p className="text-[15px] font-semibold text-grey-900 line-clamp-2 leading-snug">
            {item.title}
          </p>
        </Link>
      </div>
    </li>
  );
}

function DdayBadge({ dday }: { dday: number | null }) {
  // 사이트 전역 D-day 뱃지와 동일한 12px·px-2 톤. 마감 정보가 가장 작던 문제 해소.
  if (dday === null) {
    return (
      <span className="text-[12px] font-semibold px-2 py-0.5 rounded bg-grey-100 text-grey-600">
        상시
      </span>
    );
  }
  if (dday < 0) {
    return (
      <span className="text-[12px] font-semibold px-2 py-0.5 rounded bg-grey-100 text-grey-500">
        마감
      </span>
    );
  }
  if (dday <= 7) {
    return (
      <span className="text-[12px] font-semibold px-2 py-0.5 rounded bg-[#FFEEEE] text-red">
        D-{dday}
      </span>
    );
  }
  return (
    <span className="text-[12px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600">
      D-{dday}
    </span>
  );
}

// 클라이언트 측 D-day 계산 — lib/programs.ts 의 calcDday 와 동일 로직
// (server-only 모듈을 client 에서 못 import 해서 단순 재구현)
function calcDdayClient(applyEnd: string | null): number | null {
  if (!applyEnd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(applyEnd);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}
