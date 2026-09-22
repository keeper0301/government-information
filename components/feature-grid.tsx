import { ADSENSE_REVIEW_MODE } from "@/lib/adsense-review-mode";

const features = [
  {
    num: "01",
    title: "조건에 맞는 혜택만 보여드려요",
    desc: "나이, 지역, 직업 정보를 입력하면 받을 수 있는 복지와 대출만 필터링합니다.",
  },
  {
    num: "02",
    title: "마감 전에 이메일로 알려드려요",
    desc: "관심 있는 사업을 등록하면 신청 마감 7일 전에 이메일 알림을 보내드립니다.",
  },
  {
    num: "03",
    title: "모르는 건 챗봇에게 물어보세요",
    desc: "자격 요건이 헷갈릴 때, 챗봇이 해당 프로그램 정보를 바탕으로 안내합니다.",
  },
];

const reviewModeFeatures = [
  {
    num: "01",
    title: "원문을 먼저 확인합니다",
    desc: "정부·지자체 공고, 복지로·보조금24·정책자금 안내처럼 확인 가능한 출처를 우선 봅니다.",
  },
  {
    num: "02",
    title: "신청 판단 기준을 분리합니다",
    desc: "대상·소득·지역·중복 제한·제출 서류처럼 사용자가 놓치기 쉬운 기준을 따로 정리합니다.",
  },
  {
    num: "03",
    title: "수정 요청을 열어둡니다",
    desc: "공고 변경이나 오류를 발견하면 문의·정정 요청을 받아 확인 후 반영하는 기준을 공개합니다.",
  },
];

export function FeatureGrid() {
  const items = ADSENSE_REVIEW_MODE ? reviewModeFeatures : features;

  return (
    <div>
      <div className="mb-8">
        {/* 섹션 overline — Pretendard 굵은 대문자 + 와이드 tracking (핀테크 톤) */}
        <div className="text-[11px] font-bold text-blue-500 tracking-[0.18em] mb-3">
          {ADSENSE_REVIEW_MODE ? "EDITORIAL PROCESS" : "THREE STEPS"}
        </div>
        <h2 className="text-[26px] font-bold tracking-[-0.8px] text-grey-900">
          {ADSENSE_REVIEW_MODE ? "이렇게 검토해 정리합니다" : "이렇게 도와드려요"}
        </h2>
      </div>
      <div className="space-y-6">
        {items.map((f) => (
          <div key={f.num} className="flex items-start gap-6 p-6 bg-white rounded-3xl shadow-sm max-md:flex-col max-md:gap-4">
            {/* 번호 — Pretendard 큼직한 tabular-nums (편집물 italic 폐기) */}
            <div className="font-extrabold tabular-nums shrink-0 text-[44px] text-blue-500 w-[60px] leading-none mt-1">
              {f.num}
            </div>
            <div>
              <div className="text-[17px] font-bold text-grey-900 tracking-[-0.4px] mb-2 leading-[1.4]">
                {f.title}
              </div>
              <div className="text-[16px] text-grey-900 leading-[1.75]">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
