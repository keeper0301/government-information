"use client";

// app/admin/recommendation-trace/persona-form.tsx
// 페르소나 선택 → URL ?persona=<id> 업데이트 → server component 재렌더

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PERSONAS, type PersonaId } from "./personas";

type Props = {
  current: PersonaId;
};

export function PersonaForm({ current }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (id: PersonaId) => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (id !== "self") params.set("persona", id);
      router.push(`/admin/recommendation-trace?${params.toString()}`);
    });
  };

  return (
    <div className="rounded-lg border border-grey-200 bg-white p-4">
      <p className="text-xs font-semibold text-grey-700 mb-2 tracking-[0.04em] uppercase">
        프로필 선택
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleChange("self")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
            current === "self"
              ? "bg-blue-500 text-white border-blue-500"
              : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
          }`}
        >
          🧑 사장님 본인
        </button>
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={isPending}
            onClick={() => handleChange(p.id)}
            title={p.description}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              current === p.id
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {isPending && (
        <p className="text-xs text-grey-500 mt-2">로딩 중...</p>
      )}
    </div>
  );
}
