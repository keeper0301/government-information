"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 프로필 선택지 목록 (상수)
const AGE_GROUPS = ["10대", "20대", "30대", "40대", "50대", "60대 이상"];
const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];
const OCCUPATIONS = ["학생", "직장인", "자영업", "공무원", "주부", "무직", "기타"];
const INTERESTS = [
  "복지", "대출", "청년", "출산·육아", "창업", "주거", "교육", "의료", "고용",
];

// 프로필 폼 (클라이언트 컴포넌트)
// - 나이대·지역·직업·관심사(다중선택) 편집
// - 저장 버튼 누르면 user_profiles 에 upsert (RLS가 본인 것만 허용)
type Profile = {
  age_group: string | null;
  region: string | null;
  occupation: string | null;
  interests: string[];
};

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 관심사는 체크박스 다중 선택 → 토글 방식
  function toggleInterest(value: string) {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(value)
        ? prev.interests.filter((i) => i !== value)
        : [...prev.interests, value],
    }));
  }

  // 저장: 본인 id 로 upsert (RLS가 auth.uid() == id 만 허용)
  async function handleSave() {
    setSaving(true);
    setMessage(null);
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
      occupation: form.occupation,
      interests: form.interests,
    });
    if (error) {
      setError("저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.");
    } else {
      setMessage("저장됐어요.");
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
        onChange={(v) => setForm((p) => ({ ...p, age_group: v }))}
      />

      {/* 지역 */}
      <ChipSelect
        label="거주 지역"
        options={REGIONS}
        value={form.region}
        onChange={(v) => setForm((p) => ({ ...p, region: v }))}
      />

      {/* 직업 */}
      <ChipSelect
        label="직업"
        options={OCCUPATIONS}
        value={form.occupation}
        onChange={(v) => setForm((p) => ({ ...p, occupation: v }))}
      />

      {/* 관심사 (다중 선택) */}
      <div>
        <label className="block text-[13px] font-semibold text-grey-700 mb-2">
          관심 분야{" "}
          <span className="text-grey-500 font-normal">(여러 개 선택 가능)</span>
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

      {/* 메시지 */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-sm text-red">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-600 font-medium">
          {message}
        </div>
      )}

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-blue-500 text-white rounded-lg text-[15px] font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 cursor-pointer"
      >
        {saving ? "저장 중..." : "저장하기"}
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
