"use client";

import { useState } from "react";
import { cleanDescription } from "@/lib/utils";

// 핵심 정보 카드 안의 1 필드 (label + value).
// 처리 책임:
//   1) cleanDescription 으로 HTML 엔티티(&nbsp; · &amp; 등) · 태그 · 섹션 구분자 정제
//      → 스크래퍼가 원문 HTML 그대로 저장한 케이스에서도 깔끔하게 표시.
//   2) whitespace-pre-line 으로 cleanDescription 이 삽입한 \n 을 실제 줄바꿈으로 렌더.
//   3) 200자 넘는 긴 값은 "더보기" 토글 (카드가 본문보다 길어지는 어색함 방지).
//   4) 정제 후 빈 문자열이면 렌더하지 않음 (raw 가 공백·HTML 만 있던 케이스).
//
// 기존 문제: value 를 raw 로 출력 + whitespace 처리 없음 → 화면에 &nbsp;·☞ 같은
// 기호가 그대로 노출되고 줄바꿈도 무시됐음.
const COLLAPSE_THRESHOLD = 200;

export function SummaryItem({ label, value }: { label: string; value: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!value) return null;
  const cleaned = cleanDescription(value);
  if (!cleaned) return null;

  const isLong = cleaned.length > COLLAPSE_THRESHOLD;
  const display = !isLong || expanded ? cleaned : cleaned.slice(0, COLLAPSE_THRESHOLD).trimEnd() + "…";

  return (
    <div className="py-4">
      <div className="text-[12px] font-bold tracking-[1px] text-grey-600 uppercase mb-1.5">
        {label}
      </div>
      <div className="text-[16px] font-medium text-grey-900 leading-[1.6] whitespace-pre-line break-words">
        {display}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[13px] font-semibold text-blue-500 hover:text-blue-600 transition-colors"
        >
          {expanded ? "접기" : "더보기"}
        </button>
      )}
    </div>
  );
}
