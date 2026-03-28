"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const REGIONS = ["전체", "전국", "서울", "경기", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const TARGETS = ["전체", "청년", "노인", "부모", "저소득", "장애인", "전체대상"];

export function FilterBar({ region, target }: { region: string; target: string }) {
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
      router.push(`/welfare${qs ? `?${qs}` : ""}`);
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
