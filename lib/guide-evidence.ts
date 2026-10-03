import type { PolicyGuide } from "@/lib/policy-guides";
import { EDITORIAL_GUIDES } from "@/lib/editorial-guides";
import type { ContentStatus } from "@/lib/content-quality";

export interface GuideEvidence {
  question: string;
  answer: string;
  categorySlugs: string[];
  status: ContentStatus;
  actualUpdatedAt: string;
  ownerReviewed: boolean;
  sources: { agency: string; title: string; url: string; scope: string; checkedAt: string }[];
  conditions: { item: string; fact: string; interpretation: string }[];
  headings: string[];
  changeLog: string;
}
const gov = { agency: "행정안전부 · 정부24", title: "주민등록표 등본(초본) 발급", url: "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000015", scope: "민원 발급 절차. 지원사업의 선정 조건을 확인한 자료는 아닙니다.", checkedAt: "2026-10-03" };
const semas = { agency: "소상공인시장진흥공단", title: "2026년 정책자금 한눈에 보기", url: "https://ols.semas.or.kr/ols/man/SMAN018M/page.do", scope: "2026년 중앙 정책자금 개요. 개별 회차의 세부 공지는 별도 확인해야 합니다.", checkedAt: "2026-10-03" };
export const GUIDE_EVIDENCE: Record<string, GuideEvidence> = {
  "documents-before-government-benefit": {
    question: "지원금 신청 서류는 무엇부터 준비해야 하나요?", answer: "신청할 사업의 제출 목록을 먼저 펼치고, 요구하는 서류명·발급일·표시 항목을 정리하세요. 정부24에서 발급할 수 있다는 사실과 그 사업에서 해당 서류를 받는다는 사실은 다릅니다.",
    categorySlugs: ["youth", "senior", "housing", "business"], status: "source-checked", actualUpdatedAt: "2026-10-03", ownerReviewed: false, sources: [gov],
    headings: ["서류 준비의 시작점", "등본과 초본을 구분하기", "제출 규격 확인", "대리 신청과 공동이용", "제출 전 점검"],
    conditions: [
      { item: "발급 서비스·기관", fact: "정부24 주민등록표 등본(초본) 발급 / 행정안전부", interpretation: "지원사업 신청처와 서류 발급처를 별도로 적어 두세요." },
      { item: "신청 방법·자격", fact: "인터넷·방문·무인발급기. 본인 또는 대리인 신청 가능하나 온라인 대리인 신청은 불가", interpretation: "가족이 대신 준비한다면 온라인 대리 발급이 가능하다고 가정하지 마세요." },
      { item: "수수료", fact: "정부24 안내상 인터넷 발급은 무료", interpretation: "민원 발급 수수료와 지원사업 신청 비용을 혼동하지 마세요." },
      { item: "지역·회차·마감·중복", fact: "이 민원 발급 안내는 지원사업의 지역·회차·자격·중복 제한을 정하지 않습니다.", interpretation: "신청할 사업의 공고에서 따로 확인할 항목입니다." },
    ], changeLog: "서류 발급 근거와 사업별 제출 요건을 구분하고 온라인 대리 발급 제한을 추가했습니다.",
  },
  "small-business-policy-fund-mistakes": {
    question: "소상공인 정책자금 신청 전에 어떤 차이를 봐야 하나요?", answer: "자금명과 직접·대리대출 유형부터 확인하세요. 자금마다 신청요건과 상환 조건이 다릅니다. 신청요건에 맞는다는 것만으로 대출 실행이나 한도가 확정되지는 않습니다.",
    categorySlugs: ["business"], status: "source-checked", actualUpdatedAt: "2026-10-03", ownerReviewed: false, sources: [semas, { ...semas, title: "정책자금 접수 현황과 일정 안내", url: "https://ols.semas.or.kr/ols/man/SMAN010M/page.do", scope: "2026-10-03에 공개된 접수 현황. 이후 접수 상태는 다시 확인해야 합니다." }],
    headings: ["먼저 자금명을 정하기", "대상·제외 업종 확인", "직접·대리대출 비교", "금리·상환 부담 확인", "접수 상태와 제출 기록"],
    conditions: [
      { item: "기관·범위", fact: "소상공인시장진흥공단의 2026년 중앙 정책자금 개요", interpretation: "지자체 이차보전·보증 상품의 조건으로 확대해서 읽지 마세요." },
      { item: "공통 자격", fact: "상시근로자 5인 미만, 제조업·건설업·운수업·광업은 10인 미만 업체 안내. 제외 업종 별도", interpretation: "근로자 수 하나만으로 신청 자격을 확정하지 말고 자금별 공지를 대조하세요." },
      { item: "직접·대리대출", fact: "공식 안내는 직접대출과 대리대출의 자금별 요건·기간·한도·금리를 구분합니다.", interpretation: "확인서 발급, 보증, 은행 심사 등 본인 신청 유형의 절차를 따로 확인하세요." },
      { item: "금리", fact: "개요에 기준금리 연동형과 고정금리 상품이 함께 안내됩니다.", interpretation: "낮은 금리만 보지 말고 적용 분기·가산금리·보증료·상환방식을 함께 비교하세요. 여기에 현재 금리를 확정 표시하지 않습니다." },
      { item: "기간·종료", fact: "자금별 접수 순서대로 처리하며 예산 소진 시 마감한다고 안내합니다.", interpretation: "이 글은 접수중을 보장하지 않습니다. 신청 당일 일정과 해당 자금 공지를 확인하세요." },
      { item: "서류·중복 제한", fact: "세부 신청요건은 자금별 공지사항을 참고하도록 안내합니다.", interpretation: "공통 서류 목록을 임의로 확정하지 마세요. 기지원 이력과 기존 대출을 적고 해당 공지에서 제외·한도 차감 규정을 확인하세요." },
    ], changeLog: "2026년 자금 유형별 공식 안내를 연결하고 보편 금리·승인 보장을 제거했습니다.",
  },
  "youth-rent-checklist-2026": {
    question: "2026년 청년월세 신규 모집은 지금 신청할 수 있나요?", answer: "전국 국토교통부 사업의 2026년 신규 모집은 5월 29일 16:00에 마감됐습니다. 이 글은 마감된 모집의 조건과 서류를 확인하는 안내입니다. 계속사업 전환은 상시 접수를 뜻하지 않으며 다음 회차의 일정·조건은 새 공고로 확인해야 합니다.",
    categorySlugs: ["youth", "housing"], status: "closed", actualUpdatedAt: "2026-10-04", ownerReviewed: false,
    sources: [
      { agency: "국토교통부 청년주거정책과", title: "30일부터 청년월세 지원사업 신청하세요! — 2026년 신규 모집", url: "https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=95091798", scope: "2026-03-18 등록 공고와 첨부 주요 내용. 전국 2026년 신규 모집에 한정합니다.", checkedAt: "2026-10-04" },
      { agency: "복지로 · 국토교통부", title: "청년월세 지원사업 — 기준연도 2026", url: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00004661", scope: "공개 지원대상·서비스 내용·신청방법 탭. 해당 신규 접수는 마감됐습니다.", checkedAt: "2026-10-04" },
      { agency: "서울특별시", title: "2026년 서울시 청년월세지원 모집 공고", url: "https://housing.seoul.go.kr/site/main/board/notice/12667", scope: "별도 서울시 사업임을 대조하기 위한 자료. 전국 사업의 자격 기준으로 적용하지 않습니다. 2026년 모집은 마감됐습니다.", checkedAt: "2026-10-04" },
    ],
    headings: ["2026년 신규 모집은 마감됐습니다", "청년가구와 원가구를 나눠 확인", "보증금·관리비와 중복 지원 구분", "공식 제출 자료와 발급 순서", "계속사업과 상시 접수는 다릅니다"],
    conditions: [
      { item: "사업·기관·회차·지역", fact: "국토교통부 청년월세 지원사업 / 전국 / 2026년 신규수혜자 모집. 지자체 자체 월세 사업과 별도", interpretation: "지원받은 사업명과 담당 기관을 먼저 적으세요. 서울시의 연령·임차료 조건을 전국 사업에 옮겨 적용하지 마세요." },
      { item: "기간·접수 상태", fact: "2026-03-30 09:00~2026-05-29 16:00. 2026-10-04 확인 기준 신규 접수 마감", interpretation: "과거 신청 경로가 열려 있어도 접수중이라는 뜻은 아닙니다. 다음 회차나 다른 지역 추가 모집은 별도 확인이 필요합니다." },
      { item: "연령·거주", fact: "부모와 따로 거주하는 무주택 19~34세 청년. 공고상 2026년 신청 가능 출생연도는 1991~2007년생", interpretation: "생일이 지났는지만으로 판단하지 말고 해당 공고의 출생연도 기준을 확인하세요." },
      { item: "소득·재산", fact: "청년가구 중위소득 60% 이하·재산 1.22억원 이하, 원가구 중위소득 100% 이하·재산 4.7억원 이하. 30세 이상·혼인 등 원가구 심사 예외 있음", interpretation: "월급과 통장 잔액만으로 자격을 정하지 마세요. 가구 범위, 소득평가액과 인정 부채는 복지로 상세와 담당 기관에서 확인해야 합니다." },
      { item: "지원액·지급 범위", fact: "실제 월세 범위에서 월 최대 20만원, 최대 24개월(회)·480만원, 생애 1회. 보증금·관리비 제외", interpretation: "최대액은 모든 신청자의 지급액이나 선정 보장이 아닙니다. 2026년 신규 선정자의 지급기간 안내는 2028년 12월까지이며 재개 요건은 공식 상세를 확인하세요." },
      { item: "제외·중복 지원", fact: "주택 소유, 공공임대, 2촌 이내 혈족 주택 임차 등 제외. 국토부·지자체 청년월세 수혜 중인 경우 제외하고 종료 후 신청 가능. 기존 한시지원 24회 수혜 완료자 제외", interpretation: "종료 후 신청 가능도 해당 접수기간 안에서 읽어야 합니다. 계약 형태별 예외와 기존 지원 이력을 기관에 설명하세요." },
      { item: "주거급여·2026년 변경", fact: "주거급여 월차임분을 차감한 금액만 지원. 2026년 신규 모집부터 청약통장 가입 요건 삭제", interpretation: "주거급여를 받으면 무조건 제외된다고 읽거나 이전 회차의 청약통장 요건을 그대로 적용하지 마세요." },
      { item: "서류·공식 안내 경로", fact: "신청서, 소득·재산 신고서, 임대차계약서, 최근 3개월 월세 이체증빙, 통장사본, 가족관계증명서 등. 복지로 온라인 또는 주소지 관할 주민센터", interpretation: "아래 복지로 직접 안내에서 매뉴얼과 서식을 대조하세요. 대리 신청·현금 납부·계약 형태의 예외 자료는 공식 창구에 문의하고 개인정보는 keepioo에 보내지 마세요." },
    ], changeLog: "국토교통부 2026년 모집 공고·복지로 상세를 대조해 실제 조건과 서류를 추가하고 접수 마감을 명시했습니다. 서울시 자체 사업은 별도 출처로 구분했습니다.",
  },
};
/** Evidence applies only to the exact locally reviewed body version, not a coincident DB slug. */
export function getGuideEvidence(guide: Pick<PolicyGuide, "slug" | "title" | "posts">): GuideEvidence | undefined {
  const builtin = EDITORIAL_GUIDES.find(g => g.slug === guide.slug);
  return builtin && builtin.title === guide.title && JSON.stringify(builtin.posts) === JSON.stringify(guide.posts) ? GUIDE_EVIDENCE[guide.slug] : undefined;
}
export function guideCategorySlugs(guide: Pick<PolicyGuide, "slug" | "title" | "programType">): string[] {
  if (GUIDE_EVIDENCE[guide.slug]) return GUIDE_EVIDENCE[guide.slug].categorySlugs;
  const text = `${guide.slug} ${guide.title}`;
  if (/소상공인|사업자|자영업|business|policy-fund|tax-delinquency/.test(text)) return ["business"];
  if (/월세|전세|주거|rent|housing|lease/.test(text)) return ["housing", "youth"];
  if (/노년|노인|기초연금|senior|pension/.test(text)) return ["senior"];
  if (/청년|youth/.test(text)) return ["youth"];
  return [];
}
