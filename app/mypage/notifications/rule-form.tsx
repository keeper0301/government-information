"use client";

// ============================================================
// 맞춤 알림 규칙 생성/수정 폼 (클라이언트)
// ============================================================
// 5개 차원 (지역/연령/업종/혜택/가구형태) 체크박스 그룹 + 키워드 + 채널 선택
// "미리보기" 버튼으로 현재 규칙의 매칭 개수 표시
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  REGION_TAGS,
  AGE_TAGS,
  OCCUPATION_TAGS,
  BENEFIT_TAGS,
  HOUSEHOLD_TAGS,
} from "@/lib/tags/taxonomy";
import type { Tier } from "@/lib/subscription";

type Rule = {
  id: string;
  name: string;
  region_tags: string[];
  age_tags: string[];
  occupation_tags: string[];
  benefit_tags: string[];
  household_tags: string[];
  keyword: string | null;
  channels: string[];
  phone_number: string | null;
  is_active: boolean;
};

type Props = {
  tier: Tier;
  existingRules: Rule[];
  /** 카카오 알림톡 수신 동의 현재 상태 — 체크박스 활성화 조건 (tier + consent 둘 다 필요) */
  kakaoConsented: boolean;
};

export function RuleForm({ tier, existingRules, kakaoConsented }: Props) {
  const router = useRouter();
  const [name, setName] = useState("내 맞춤 알림");
  const [regions, setRegions] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [occupations, setOccupations] = useState<string[]>([]);
  const [benefits, setBenefits] = useState<string[]>([]);
  const [households, setHouseholds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [phone, setPhone] = useState("");
  const [preview, setPreview] = useState<{ total: number; samples: { id: string; title: string; source: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (arr: string[], setArr: (s: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
    setPreview(null);
  };

  const body = {
    name: name.trim(),
    region_tags: regions,
    age_tags: ages,
    occupation_tags: occupations,
    benefit_tags: benefits,
    household_tags: households,
    keyword: keyword.trim() || null,
    channels,
    phone_number: channels.includes("kakao") ? phone.trim() : null,
  };

  const runPreview = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, action: "preview" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "미리보기 실패");
        return;
      }
      setPreview(json);
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    if (channels.includes("kakao") && !phone.match(/^01[016789]-?\d{3,4}-?\d{4}$/)) {
      setMessage("카카오 알림톡 받을 휴대폰 번호를 정확히 입력해주세요.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "저장 실패");
        return;
      }
      setMessage("알림 규칙이 등록되었어요. 이제 매일 오후 4시에 새 정책이 이메일로 발송됩니다.");
      setPreview(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm("이 알림 규칙을 삭제할까요?")) return;
    const res = await fetch(`/api/alert-rules/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  };

  const toggleActive = async (rule: Rule) => {
    await fetch(`/api/alert-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    router.refresh();
  };

  return (
    <div className="space-y-8">
      {/* 기존 규칙 목록 */}
      {existingRules.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">내 알림 규칙 ({existingRules.length}개)</h2>
          <div className="space-y-2">
            {existingRules.map((r) => (
              <div key={r.id} className="flex items-center justify-between border border-gray-200 rounded-xl p-4">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {r.name}
                    {!r.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">일시중지</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {[
                      r.region_tags.length > 0 && `지역: ${r.region_tags.join(",")}`,
                      r.age_tags.length > 0 && `연령: ${r.age_tags.join(",")}`,
                      r.occupation_tags.length > 0 && `업종: ${r.occupation_tags.join(",")}`,
                      r.benefit_tags.length > 0 && `분야: ${r.benefit_tags.join(",")}`,
                      r.household_tags.length > 0 && `가구: ${r.household_tags.join(",")}`,
                    ].filter(Boolean).join(" · ") || "모든 정책"}
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => toggleActive(r)} className="text-gray-600 underline">
                    {r.is_active ? "중지" : "재개"}
                  </button>
                  <button onClick={() => deleteRule(r.id)} className="text-red-600 underline">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 새 규칙 폼 */}
      <section className="border-t pt-8">
        <h2 className="text-lg font-bold mb-3">새 알림 규칙 추가</h2>

        <label className="block mb-4">
          <span className="text-sm font-semibold mb-1 block">이름</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <TagGroup label="관심 지역 (비우면 전국)" tags={REGION_TAGS} selected={regions}
          onToggle={(v) => toggle(regions, setRegions, v)} />
        <TagGroup label="관심 연령" tags={AGE_TAGS} selected={ages}
          onToggle={(v) => toggle(ages, setAges, v)} />
        <TagGroup label="업종·직업" tags={OCCUPATION_TAGS} selected={occupations}
          onToggle={(v) => toggle(occupations, setOccupations, v)} />
        <TagGroup label="혜택 분야 (주거·의료·문화 등)" tags={BENEFIT_TAGS} selected={benefits}
          onToggle={(v) => toggle(benefits, setBenefits, v)} />
        <TagGroup label="가구·개인 상태" tags={HOUSEHOLD_TAGS} selected={households}
          onToggle={(v) => toggle(households, setHouseholds, v)} />

        <label className="block mb-4">
          <span className="text-sm font-semibold mb-1 block">추가 키워드 (선택)</span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예: 전기차, 창업자금, 지원금"
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <div className="mb-4">
          <span className="text-sm font-semibold mb-2 block">수신 채널</span>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={channels.includes("email")}
                onChange={(e) => setChannels(e.target.checked
                  ? Array.from(new Set([...channels, "email"]))
                  : channels.filter((c) => c !== "email"))} />
              <span>이메일 알림</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={tier !== "pro" || !kakaoConsented}
                checked={channels.includes("kakao")}
                onChange={(e) => setChannels(e.target.checked
                  ? Array.from(new Set([...channels, "kakao"]))
                  : channels.filter((c) => c !== "kakao"))} />
              <span className={tier !== "pro" || !kakaoConsented ? "text-gray-400" : ""}>
                카카오 알림톡
                {tier !== "pro" && <span className="ml-2 text-xs text-gray-500">(프로 플랜 전용)</span>}
                {tier === "pro" && !kakaoConsented && (
                  <span className="ml-2 text-xs text-gray-500">(수신 동의 필요)</span>
                )}
              </span>
            </label>
            {tier === "pro" && !kakaoConsented && (
              <p className="text-xs text-gray-600 ml-6">
                카카오 알림톡을 받으려면 먼저{" "}
                <Link href="/mypage#consents" className="text-blue-600 underline">
                  마이페이지 동의 관리
                </Link>{" "}
                에서 <strong>카카오 알림톡 수신</strong> 동의를 켜 주세요.
              </p>
            )}
          </div>
          {channels.includes("kakao") && (
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-1234-5678"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={runPreview} disabled={loading}
            className="rounded-xl bg-gray-100 px-4 py-3 font-semibold">
            미리보기
          </button>
          <button onClick={saveRule} disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold">
            알림 규칙 저장
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">{message}</div>
        )}

        {preview && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="font-semibold text-blue-900 mb-2">
              현재 조건으로 매칭 중인 정책: <strong>{preview.total}건</strong>
            </div>
            {preview.samples.length > 0 && (
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                {preview.samples.map((s) => (
                  <li key={s.id}>{s.title} <span className="text-gray-400">· {s.source}</span></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function TagGroup({
  label, tags, selected, onToggle,
}: {
  label: string;
  tags: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="text-sm font-semibold mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => {
          const on = selected.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              className={`rounded-full px-3 py-1.5 text-sm border transition ${
                on
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
