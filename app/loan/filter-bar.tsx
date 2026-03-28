"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const TARGETS = ["전체", "소상공인", "자영업", "창업", "청년창업", "전통시장"];

export function FilterBar({ target }: { target: string }) {
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
