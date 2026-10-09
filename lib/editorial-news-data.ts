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
  sections: { heading: string; paragraphs: string[];
    table?: { caption: string; columns: string[]; rows: string[][] } }[];
  photoPolicy?: 'official-only';
  guideSlug: string;
  editorialCorrection?: { correctedAt: string; summary: string };
  additionalSources?: { title: string; url: string; checkedAt: string; scope: string }[];
  automaticPublication?: { checkedAt: string; sourceHash: string };
  classification?: { benefits: string[]; regions: string[] };
}

// 자동 수집 기사와 분리한 편집 초안입니다. 운영자 승인 기록이 있어야 공개됩니다.
export const EDITORIAL_NEWS: EditorialNews[] = [{
  "slug": "onnuri-reform-shop-checklist-2026",
  "title": "온누리 개편, 구매 할인과 환급은 다릅니다…전통시장·지방 골목상권 비교",
  "question": "전통시장 최대 10% 혜택은 결제할 때 바로 10% 할인된다는 뜻인가요?",
  "answer": "10월 1일 개편 발표는 전통시장 ‘구매 할인 5%+사용 후 환급 5%’, 지방 골목상권 ‘구매 할인 5%+사용 후 환급 3%’를 구분합니다. 합산 혜택을 결제 즉시 할인율로 안내하면 오해가 생깁니다. 내 점포의 가맹 상태와 실제 이용일의 적용 조건을 함께 확인해야 합니다.",
  "audience": "전통시장·골목상권 온누리상품권 가맹점주와 이용 고객",
  "sourceAgency": "중소벤처기업부 · 대한민국 정책브리핑",
  "sourceTitle": "온누리상품권, 전통시장 최대 10% 할인…지방 골목상권은 8%까지",
  "sourceUrl": "https://www.korea.kr/news/policyNewsView.do?newsId=148972815",
  "sourcePublishedAt": "2026-10-01",
  "checkedAt": "2026-10-09",
  "updatedAt": "2026-10-09",
  "sections": [
    {
      "heading": "구매 할인과 사용 후 환급을 나눠 읽기",
      "paragraphs": [
        "중소벤처기업부가 10월 1일 발표한 개편은 전통시장과 지방상권에 소비 혜택을 집중하는 방향입니다. 구매 단계의 할인과 사용 이후 환급은 시점이 다릅니다.",
        "아래는 발표된 혜택 구성입니다. 이 기사만으로 모든 상품권·가맹점에서 같은 날 적용된다고 확정하거나 실제 환급액을 계산할 수는 없습니다."
      ],
      "table": {
        "caption": "상권별 발표 혜택 비교",
        "columns": [
          "사용 상권",
          "구매 시 할인",
          "사용 후 환급",
          "발표된 합산 혜택"
        ],
        "rows": [
          [
            "전통시장",
            "5%",
            "5%",
            "최대 10%"
          ],
          [
            "지방 골목상권",
            "5%",
            "3%",
            "최대 8%"
          ]
        ]
      }
    },
    {
      "heading": "내 점포의 가맹 조건과 상권 구분 확인",
      "paragraphs": [
        "공식 발표는 올해 6월부터 연매출 30억 원 이하 가맹점을 중심으로 운영한다고 설명합니다. 병·의원과 법무·회계·세무 등 전문서비스업의 가맹은 제한하고, 약국은 상권 내 집객 효과 등을 고려해 허용한다고 밝혔습니다.",
        "업종이나 매출 조건만으로 개별 점포가 현재 가맹점이라고 확정할 수는 없습니다. 점주는 현재 등록 상태와 자신의 상권 구분을 확인한 뒤 안내해야 합니다. 가까운 가게가 사용처라는 이유로 같은 혜택을 약속하지 마세요.",
        "기업형 슈퍼마켓 등의 등록·갱신 제한은 법 개정을 추진하는 방안입니다. 발표에 나온 추진 사항을 이미 시행된 동일 기준으로 섞어 설명하지 않도록 구분합니다."
      ]
    },
    {
      "heading": "할인 안내문을 붙이기 전에 확인할 순서",
      "paragraphs": [
        "먼저 현재 가맹 상태와 전통시장·지방 골목상권 등 상권 구분을 확인합니다. 다음으로 이용할 상품권의 적용 시작일, 환급 절차와 한도를 실제 공식 안내에서 확인합니다. 확인 날짜와 근거 화면을 직원에게 공유하면 고객 안내가 서로 달라지는 일을 줄일 수 있습니다.",
        "안내문은 ‘구매 할인’과 ‘사용 후 환급’을 따로 적는 편이 명확합니다. 예를 들어 ‘발표된 전통시장 혜택은 구매 할인 5%와 사용 후 환급 5%이며, 적용 조건은 이용 시점의 공식 안내를 확인해주세요’라고 설명할 수 있습니다. 이 문장은 키피오의 안내 예시이며 정부 의무 문구는 아닙니다."
      ]
    },
    {
      "heading": "지역 관광 연계와 가맹 관리 개선은 어떤 내용인가",
      "paragraphs": [
        "발표에는 지방 디지털 온누리 이용과 지역명소 입장권·숙박권·지역쇼핑몰 할인쿠폰 등을 연계하는 방향도 담겼습니다. 모든 이용자가 같은 숙박권을 자동으로 받는다는 지급 조건은 아닙니다.",
        "지도 앱에서 가맹점 찾기, 민간 플랫폼과 홍보 협력, 외국인 결제 앱의 전통시장 QR 결제 기반 구축 등이 제시됐습니다. 소비자 권익을 침해한 가맹점 등록 취소 근거와 일정 요건 충족 시 자동 갱신도 개선 방향에 포함됐습니다."
      ]
    },
    {
      "heading": "점주가 기억할 핵심",
      "paragraphs": [
        "상권별 혜택 구성, 개별 점포의 가맹 자격, 실제 적용 일정은 서로 다른 확인 항목입니다. 발표 기사만으로 즉시 10% 할인을 약속하기보다 세 항목을 나눠 읽는 것이 고객 오해를 줄이는 방법입니다.",
        "개편 발표의 정책 문의는 중소벤처기업부 전통시장과 044-204-7900입니다. 이 글은 개편안을 읽는 안내이며 개별 가맹점 등록 상태나 현재 환급 가능 금액을 조회한 결과는 아닙니다."
      ]
    }
  ],
  "guideSlug": "small-business-policy-fund-mistakes",
  "editorialCorrection": {
    "correctedAt": "2026-10-09T10:16:48.470Z",
    "summary": "구매 할인·사용 후 환급 비교표와 업종별 발표 내용을 보강하고, 추진 방안과 실제 점포 적용 확인을 구분했습니다."
  }
}, ...NEXT_EDITORIAL_NEWS];
