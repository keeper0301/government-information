"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AGE_OPTIONS,
  REGION_OPTIONS,
  OCCUPATION_OPTIONS,
  getDistrictsForRegion,
} from "@/lib/profile-options";

// 프로필 선택지 (lib/profile-options.ts 단일 소스 import).
// 여기와 /recommend, /api/recommend 가 같은 옵션을 써야 프로필 매칭이 정상 작동.
const AGE_GROUPS = AGE_OPTIONS;
// /mypage 에서는 "전국" 을 뺀 실제 지역 17개만 보여줌 (지역 고정용)
const REGIONS = REGION_OPTIONS.filter((r) => r !== "전국");
const OCCUPATIONS = OCCUPATION_OPTIONS;
const INTERESTS = [
  "복지", "대출", "청년", "출산·육아", "창업", "주거", "교육", "의료", "고용",
];

// 프로필 폼 (클라이언트 컴포넌트)
// - 나이대·지역·직업·관심사(다중선택) 편집
// - 저장 버튼 누르면 user_profiles 에 upsert (RLS가 본인 것만 허용)
type Profile = {
  age_group: string | null;
  region: string | null;
  district: string | null;
  occupation: string | null;
  interests: string[];
};

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 저장 성공 상태는 1.8초 뒤 자동 해제 → 버튼이 평상시 라벨로 복귀
  // (언마운트·재저장 시 타이머 자동 정리)
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);

  // 폼 변경 시 setForm + 성공 배지 즉시 해제를 한 번에 처리.
  // "저장됐어요 ✓" 상태에서 다른 칩을 눌렀을 때 사용자가 "이미 저장된 줄" 오인하지
  // 않도록 이벤트 핸들러에서 직접 해제 (derived-state effect 안티패턴 제거).
  function updateForm(updater: (prev: Profile) => Profile) {
    setForm(updater);
    setSaved(false);
  }

  // 관심사는 체크박스 다중 선택 → 토글 방식
  function toggleInterest(value: string) {
    updateForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(value)
        ? prev.interests.filter((i) => i !== value)
        : [...prev.interests, value],
    }));
  }

  // 저장: 본인 id 로 upsert (RLS가 auth.uid() == id 만 허용)
  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 만료되었어요. 다시 로그인해주세요.");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("user_profiles").upsert({
      id: user.id,
      age_group: form.age_group,
      region: form.region,
      district: form.district,
      occupation: form.occupation,
      interests: form.interests,
    });
    if (error) {
      setError("저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
    } else {
      setSaved(true);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* 나이대 */}
      <ChipSelect
        label="나이대"
        options={AGE_GROUPS}
        value={form.age_group}
        onChange={(v) => updateForm((p) => ({ ...p, age_group: v }))}
      />

      {/* 지역 — 광역 선택. 광역 바꾸면 시군구는 자동으로 reset (다른 광역의
          시군구가 그대로 남아있으면 매칭 어색해짐). */}
      <ChipSelect
        label="거주 지역 (광역)"
        options={REGIONS}
        value={form.region}
        onChange={(v) =>
          updateForm((p) => {
            const nextDistricts = getDistrictsForRegion(v);
            const nextDistrict =
              p.district && nextDistricts.includes(p.district) ? p.district : null;
            return { ...p, region: v, district: nextDistrict };
          })
        }
      />

      {/* 시군구 (광역 선택 후 노출) — "전체 (시군구 미지정)" 옵션 포함 */}
      {form.region && getDistrictsForRegion(form.region).length > 0 && (
        <ChipSelect
          label="시·군·구 (선택)"
          options={["전체", ...getDistrictsForRegion(form.region)]}
          value={form.district ?? "전체"}
          onChange={(v) =>
            updateForm((p) => ({
              ...p,
              district: v === "전체" ? null : v,
            }))
          }
        />
      )}

      {/* 직업 */}
      <ChipSelect
        label="직업"
        options={OCCUPATIONS}
        value={form.occupation}
        onChange={(v) => updateForm((p) => ({ ...p, occupation: v }))}
      />

      {/* 관심사 (다중 선택) */}
      <div>
        <label className="block text-[13px] font-semibold text-grey-700 mb-2">
          관심 분야{" "}
          <span className="text-grey-600 font-normal">(여러 개 선택 가능)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((item) => {
            const selected = form.interests.includes(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleInterest(item)}
                className={`px-3.5 py-2 rounded-full text-[14px] font-medium border transition-colors cursor-pointer ${
                  selected
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {/* 에러 메시지 (실패는 지속 노출 — 사용자가 원인 확인할 시간 필요) */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red">
          {error}
        </div>
      )}

      {/* 스크린리더 전용 라이브 영역 — 저장 성공을 소리로도 공지 */}
      <span role="status" aria-live="polite" className="sr-only">
        {saved ? "프로필이 저장됐어요" : ""}
      </span>

      {/* 저장 버튼 — 3가지 상태(평상시 / 저장 중 / 저장 성공)
          성공 상태는 1.8초 뒤 useEffect 타이머가 자동 해제 → 버튼이 원래대로 복귀.
          성공 색은 브랜드 그린(#3F7D52)으로 성공을 명확히 시각화하되 톤은 유지 */}
      <button
        onClick={handleSave}
        disabled={saving || saved}
        className={`w-full py-3 rounded-lg text-[15px] font-semibold transition-colors cursor-pointer disabled:cursor-default ${
          saved
            ? "bg-green text-white"
            : "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
        }`}
      >
        {saving ? "저장 중..." : saved ? "저장됐어요 ✓" : "저장하기"}
      </button>
    </div>
  );
}

// 공통: 단일 선택 칩 그룹 (나이·지역·직업에서 재사용)
function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-grey-700 mb-2">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3.5 py-2 rounded-full text-[14px] font-medium border transition-colors cursor-pointer ${
                selected
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-grey-700 border-grey-200 hover:bg-grey-50"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
