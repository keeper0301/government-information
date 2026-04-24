"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const TARGETS = ["전체", "소상공인", "자영업", "창업", "청년창업", "전통시장"];
// 지역 필터 — loan_programs 에 region 컬럼이 없어 제목 prefix `[대전]` 같은
// 패턴으로 서버에서 ilike 매칭. "전체" 는 필터 없음.
const REGIONS = [
  "전체",
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];

export function FilterBar({ target, region }: { target: string; region: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "전체") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete("page");
      const qs = params.toString();
      router.push(`/loan${qs ? `?${qs}` : ""}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex gap-1.5">
      <select
        value={region}
        onChange={(e) => navigate("region", e.target.value)}
        className="px-3 py-2 text-sm border border-grey-200 rounded-lg bg-white text-grey-800 font-pretendard outline-none cursor-pointer"
      >
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r === "전체" ? "지역 전체" : r}
          </option>
        ))}
      </select>
      <select
        value={target}
        onChange={(e) => navigate("target", e.target.value)}
        className="px-3 py-2 text-sm border border-grey-200 rounded-lg bg-white text-grey-800 font-pretendard outline-none cursor-pointer"
      >
        {TARGETS.map((t) => (
          <option key={t} value={t}>
            {t === "전체" ? "대상 전체" : t}
          </option>
        ))}
      </select>
    </div>
  );
}
