import { NEXT_EDITORIAL_NEWS } from './editorial-news-next';

export interface EditorialNews {
  slug: string;
  title: string;
  question: string;
  answer: string;
  audience: string;
  sourceAgency: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  checkedAt: string;
  updatedAt: string;
  sections: { heading: string; paragraphs: string[] }[];
  guideSlug: string;
  editorialCorrection?: { correctedAt: string; summary: string };
  automaticPublication?: { checkedAt: string; sourceHash: string };
  classification?: { benefits: string[]; regions: string[] };
}

// 자동 수집 기사와 분리한 편집 초안입니다. 운영자 승인 기록이 있어야 공개됩니다.
export const EDITORIAL_NEWS: EditorialNews[] = [{
  slug: "onnuri-reform-shop-checklist-2026",
  title: "온누리상품권 개편 발표, 가게에서 할인 안내 전 확인할 세 가지",
  question: "온누리상품권 개편 발표를 보고 가게에서 바로 10% 혜택을 안내해도 되나요?",
  answer: "발표 기사만으로 모든 가게에서 즉시 같은 혜택을 받을 수 있다고 안내하지 마세요. 점포의 가맹 상태, 상권 구분, 실제 적용 일정을 먼저 확인해야 합니다.",
  audience: "전통시장·골목상권의 온누리상품권 가맹점주와 이용 고객",
  sourceAgency: "중소벤처기업부 · 대한민국 정책브리핑",
  sourceTitle: "온누리상품권, 전통시장 최대 10% 할인…지방 골목상권은 8%까지",
  sourceUrl: "https://www.korea.kr/news/policyNewsView.do?newsId=148972815",
  sourcePublishedAt: "2026-10-01", checkedAt: "2026-10-05", updatedAt: "2026-10-05",
  sections: [
    { heading: "공식 발표에서 확인한 변화", paragraphs: [
      "중소벤처기업부는 10월 1일 온누리상품권 개편 방안을 발표했습니다. 전통시장은 구매 할인 5%와 사용 후 환급 5%, 지방 골목상권은 구매 할인 5%와 사용 후 환급 3%를 합하는 방식으로 안내했습니다.",
      "위 숫자는 발표된 개편 방안입니다. 구매 할인과 사용 후 환급은 서로 다른 절차이므로, 합산 숫자를 결제 즉시 할인율로 설명하면 고객이 실제 결제 금액을 오해할 수 있습니다.",
    ] },
    { heading: "내 점포에 적용되는지 확인하기", paragraphs: [
      "공식 발표는 올해 6월부터 연매출 30억 원 이하 가맹점을 중심으로 운영하고 있으며 일부 전문서비스업의 가맹을 제한한다고 설명합니다. 업종이나 매출만으로 내 점포의 가맹 자격을 확정할 수는 없습니다.",
      "점주는 점포명·주소·사업자등록 정보를 준비하고 가맹점 관리 창구에 현재 등록 상태와 상권 구분을 확인하세요. 근처 가게가 사용처라는 이유만으로 내 가게도 같은 조건이라고 안내하지 마세요.",
    ] },
    { heading: "고객에게 안내하기 전 점검표", paragraphs: [
      "① 점포의 가맹 상태와 상권 구분을 확인합니다. ② 사용하는 상품권의 적용 시작일과 환급 절차·한도를 확인합니다. ③ 확인한 날짜와 안내 화면을 보관하고 직원에게 같은 기준을 공유합니다.",
      "고객 안내에는 구매 할인과 사용 후 환급을 따로 적으세요. 예를 들어 ‘구매 할인과 사용 후 환급의 적용 여부는 이용 시점의 공식 안내를 확인해주세요’라고 설명할 수 있습니다. 이 문구는 키피오의 안내 예시이며 정부가 정한 의무 문구는 아닙니다.",
    ] },
    { heading: "이 글로 확정하지 않는 내용", paragraphs: [
      "이 글은 개편 발표를 점포 운영 관점에서 읽는 방법입니다. 개별 가맹점의 적용 시작일, 환급 한도, 현재 사용 가능 여부를 확인한 글은 아닙니다. 확인되지 않은 시행일이나 환급 가능 금액을 임의로 안내하지 마세요.",
    ] },
  ],
  guideSlug: "small-business-policy-fund-mistakes",
}, ...NEXT_EDITORIAL_NEWS];
