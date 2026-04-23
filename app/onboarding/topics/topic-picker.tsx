"use client";

// ============================================================
// TopicPicker — 관심 분야 다중 선택 + 저장
// ============================================================
// 마이페이지 ProfileForm 의 INTERESTS 칩 UI 와 같은 룩.
// 차이점:
//   - 단독 화면 (다른 필드 없음)
//   - 8개 한도 (UI 에서 강제, 초과 클릭 시 무시)
//   - "건너뛰기" 도 정상 흐름의 일부
//
// 저장은 user_profiles.interests upsert (RLS 가 본인만 허용).
// 건너뛰기는 빈 배열 저장 X — 그냥 nextHref 로 이동.
// (빈 배열 저장하면 "이미 결정함" 으로 잘못 인식될 수 있음)
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  topics: string[];
  maxSelectable: number;
  initialSelected: string[];
  nextHref: string;
};

export function TopicPicker({
  userId,
  topics,
  maxSelectable,
  initialSelected,
  nextHref,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(topic: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(topic)) {
        return prev.filter((t) => t !== topic);
      }
      // 한도 도달 시 추가 선택 무시 + 안내
      if (prev.length >= maxSelectable) {
        setError(`최대 ${maxSelectable}개까지 선택할 수 있어요.`);
        return prev;
      }
      return [...prev, topic];
    });
  }

  async function handleSave() {
    if (selected.length === 0) {
      setError("최소 1개 이상 선택해주세요. 또는 '건너뛰기'를 눌러주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertErr } = await supabase
      .from("user_profiles")
      .upsert({ id: userId, interests: selected });
    if (upsertErr) {
      setError("저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
      setSaving(false);
      return;
    }
    // 저장 성공 → 다음 페이지로
    router.replace(nextHref);
    router.refresh();
  }

  function handleSkip() {
    // 빈 배열 저장 안 함. 다음에 들어와도 다시 권유 가능.
    router.replace(nextHref);
  }

  return (
    <div>
      {/* 칩 그리드 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {topics.map((topic) => {
          const isOn = selected.includes(topic);
          return (
            <button
              key={topic}
              type="button"
              onClick={() => toggle(topic)}
              aria-pressed={isOn}
              className={`px-4 py-2.5 rounded-full text-[14px] font-medium border transition-colors cursor-pointer ${
                isOn
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
              }`}
            >
              {topic}
            </button>
          );
        })}
      </div>

      {/* 카운터 + 한도 안내 */}
      <p className="text-[13px] text-grey-500 mb-6">
        선택됨 {selected.length} / 최대 {maxSelectable}개
      </p>

      {/* 에러 */}
      {error && (
        <div
          role="alert"
          className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red mb-4"
        >
          {error}
        </div>
      )}

      {/* 액션 */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 bg-blue-500 text-white rounded-lg text-[15px] font-bold hover:bg-blue-600 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? "저장 중..." : "저장하고 시작하기"}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="w-full py-3 text-grey-500 text-[14px] font-medium hover:text-grey-700 transition-colors cursor-pointer"
        >
          지금은 건너뛰기
        </button>
      </div>
    </div>
  );
}
