// 데이터 빈약 안내 박스 — 본문 description 이 짧거나 핵심 정보 카드 채워진
// 필드가 1개 이하인 공고에 표시. 사용자가 "정보가 빈약하네" 라고 답답해하기 전에
// "원문에 더 풍부한 내용이 있다" 를 눈에 띄게 안내하고 원문으로 보내는 게 목적.
//
// 데이터 채움률 실측 (2026-04):
//   - 복지 6157건: eligibility 0.1%, contact_info/required_documents/detailed_content 0%
//   - 대출 1568건: eligibility 0%, apply_method/contact_info/detailed_content 0%
//   - 즉 대다수 공고가 description 1줄 + 일부 필드뿐 → 빈약 케이스가 다수
//
// 표시 위치: 핵심 정보 카드 *위*. (이전엔 카드 *아래* 또는 카드 자체가 없을 때만
// 표시했는데 사용자 입장에선 빈약한 카드 보고 답답해진 후에야 안내가 나와서
// 순서가 거꾸로였음.)

type Props = {
  sourceLink: string | null;
  source: string;
  variant: "very-sparse" | "sparse";
  // very-sparse: description<100 AND filledSummary<=1 (본문도 핵심도 거의 없음)
  // sparse:      filledSummary<=1 (본문은 있지만 핵심 정보가 빈약)
};

export function SparseDataNotice({ sourceLink, source, variant }: Props) {
  const isVerySparse = variant === "very-sparse";
  const headline = isVerySparse
    ? "이 공고는 요약 정보만 수집된 상태예요"
    : "자세한 자격·혜택 정보는 원문에서 확인할 수 있어요";
  const body = isVerySparse
    ? `${source} 원문 페이지에는 자격 요건·필요 서류·문의처 등 자세한 내용이 정리돼 있어요. 원문을 함께 확인해 주세요.`
    : "수집된 핵심 정보 외에 자격 요건·서류 등 세부 내용은 원문 페이지에 있어요. 신청 전 반드시 함께 확인하세요.";

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-5 mb-6">
      <div className="text-[15px] font-bold text-grey-900 mb-1">{headline}</div>
      <p className="text-[13px] text-grey-700 leading-[1.6] mb-4">{body}</p>
      {sourceLink ? (
        <a
          href={sourceLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-500 text-white text-[14px] font-semibold rounded-lg no-underline hover:bg-blue-600 transition-colors"
        >
          원문 페이지 열기
          <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <span className="text-[13px] text-grey-600">
          원문 링크가 수집되지 않았어요. {source}에 직접 문의해 주세요.
        </span>
      )}
    </div>
  );
}
