import type { GuideEvidence } from "@/lib/guide-evidence";
import { NEXT_GUIDE_HEADINGS } from "@/lib/next-approved-guide-posts";

// 공식 설명 범위는 승인 자료와 같으며, 사람 승인 여부는 별도 기록으로 대조합니다.
const evidence: Record<string, GuideEvidence> = {
  "bokjiro-vs-gov24-difference": {
    "verifiedBodySha256": "a6886668d476d155ed67bc629d5dca856336080ffc71e64d66a5bdffe098bca4",
    "question": "정부 혜택을 찾는 것과 복지서비스를 신청하는 것은 어디서 시작할까요?",
    "answer": "혜택을 넓게 찾으려면 정부24 혜택알리미, 복지서비스 정보를 찾고 신청 경로를 확인하려면 복지로에서 시작하세요. 어느 사이트에서 찾았든 신청할 사업의 공식 상세에서 대상·기간·제출처를 다시 확인해야 합니다.",
    "categorySlugs": [
      "youth",
      "senior",
      "housing",
      "business"
    ],
    "status": "source-checked",
    "actualUpdatedAt": "2026-10-05",
    "ownerReviewed": false,
    "sources": [
      {
        "agency": "행정안전부 · 정부24",
        "title": "행정안전부 정부24 혜택알리미",
        "url": "https://plus.gov.kr/portal/benefitV2/",
        "scope": "공개 메뉴·현재 표시 이름만 확인. 로그인 후 맞춤 조회·선정 여부는 확인하지 않음.",
        "checkedAt": "2026-10-05"
      },
      {
        "agency": "한국사회보장정보원 · 복지로",
        "title": "복지로 이용안내",
        "url": "https://www.bokjiro.go.kr/ssis-tbu/cms/pc/intro/intro/info/01/index.html",
        "scope": "검색·신청·신청현황의 기능 설명. 특정 급여의 자격 기준이 아님.",
        "checkedAt": "2026-10-05"
      },
      {
        "agency": "한국사회보장정보원 · 복지로",
        "title": "복지로 모의계산 안내",
        "url": "https://www.bokjiro.go.kr/ssis-tbu/twatbz/mkclAsis/mkclPage.do",
        "scope": "브라우저에서 안내 문구를 확인해 참고 계산과 실제 선정의 구분을 대조함. 계산을 직접 실행하지 않음.",
        "checkedAt": "2026-10-05"
      }
    ],
    "conditions": [],
    "headings": [],
    "changeLog": "오래된 메뉴 설명을 갱신하고 검색·계산·신청·선정을 구분했습니다."
  },
  "policy-application-call-script": {
    "verifiedBodySha256": "42dbd9f336fb712110225138803f691eb834cf7dd7a2d86ed3ff09c6ed4690ec",
    "question": "로그인 오류와 지원 자격 질문을 같은 곳에 문의해도 될까요?",
    "answer": "사이트 이용 문제와 사업 조건을 구분하고, 사업명·회차·헷갈리는 문구를 적어 문의하세요. 로그인이나 파일 첨부 문제인지, 자격·서류·중복 조건 질문인지 나누면 확인할 창구를 고르기 쉽습니다.",
    "categorySlugs": [
      "youth",
      "senior",
      "housing",
      "business"
    ],
    "status": "source-checked",
    "actualUpdatedAt": "2026-10-05",
    "ownerReviewed": false,
    "sources": [
      {
        "agency": "행정안전부 · 정부24",
        "title": "정부24 자주 묻는 질문과 공통 고객센터 안내",
        "url": "https://plus.gov.kr/portal/faq/",
        "scope": "이용 문의 구분. 특정 지원사업의 선정 권한을 의미하지 않음.",
        "checkedAt": "2026-10-05"
      },
      {
        "agency": "한국사회보장정보원 · 복지로",
        "title": "복지로 공식 시작 화면",
        "url": "https://www.bokjiro.go.kr/ssis-tbu/index.do",
        "scope": "모바일 시작 주소에서 이 화면으로 이동하는 것을 확인하고, 브라우저 하단에서 누리집 이용문의와 보건복지 상담 안내를 대조함. 상담 결과를 직접 검증한 자료가 아님.",
        "checkedAt": "2026-10-05"
      },
      {
        "agency": "소상공인시장진흥공단",
        "title": "소상공인 정책자금 공식 안내",
        "url": "https://ols.semas.or.kr/ols/man/SMAN010M/page.do",
        "scope": "정책자금 상담 경로. 개인의 대출 자격·접수 상태를 판정하지 않음.",
        "checkedAt": "2026-10-05"
      },
      {
        "agency": "한국사회보장정보원 · 복지로",
        "title": "복지로 이용안내",
        "url": "https://www.bokjiro.go.kr/ssis-tbu/cms/pc/intro/intro/info/01/index.html",
        "scope": "서비스 신청현황 확인 기능.",
        "checkedAt": "2026-10-05"
      }
    ],
    "conditions": [],
    "headings": [],
    "changeLog": "범용 자격 예시를 실제 상담 사례처럼 보이지 않게 바꾸고, 문의 종류·통화 기록·접수 확인을 나눴습니다."
  },
  "deadline-policy-not-missing": {
    "verifiedBodySha256": "a64811f516f1e230826adc6eb2b2ade7a16f560f2ec9dddbcc744c8f70fd2a60",
    "question": "지원사업 마감일만 달력에 넣으면 충분할까요?",
    "answer": "마감 날짜와 함께 종료 시각·접수 방식·예산 소진 조건을 기록하세요. 신청 당일 공식 접수 상태를 다시 보고, 제출 뒤에는 접수 내역이나 처리 상태를 확인해야 합니다.",
    "categorySlugs": [
      "youth",
      "senior",
      "housing",
      "business"
    ],
    "status": "source-checked",
    "actualUpdatedAt": "2026-10-05",
    "ownerReviewed": false,
    "sources": [
      {
        "agency": "소상공인시장진흥공단",
        "title": "소상공인 정책자금 접수 화면",
        "url": "https://ols.semas.or.kr/ols/man/SMAN010M/page.do",
        "scope": "조회 당시 상시·자금 소진 표시. 전체 지원사업의 공통 규칙이 아님.",
        "checkedAt": "2026-10-05"
      },
      {
        "agency": "한국사회보장정보원 · 복지로",
        "title": "복지로 2026년 청년월세 공지",
        "url": "https://www.bokjiro.go.kr/ssis-tbu/cms/pc/customer/notice/1309500_1141.html",
        "scope": "과거 신규 접수의 종료 날짜·시각. 현재 모집이나 다음 회차의 기준이 아님.",
        "checkedAt": "2026-10-05"
      },
      {
        "agency": "한국사회보장정보원 · 복지로",
        "title": "복지로 이용안내",
        "url": "https://www.bokjiro.go.kr/ssis-tbu/cms/pc/intro/intro/info/01/index.html",
        "scope": "신청현황 확인 기능.",
        "checkedAt": "2026-10-05"
      }
    ],
    "conditions": [],
    "headings": [],
    "changeLog": "근거 없는 접수 혼잡 표현과 고정 알림 규칙을 걷어내고, 공식 종료 조건과 개인 준비 일정을 분리했습니다."
  }
};
export const NEXT_GUIDE_EVIDENCE = Object.fromEntries(Object.entries(evidence).map(([slug, item]) => [slug, { ...item, headings: NEXT_GUIDE_HEADINGS[slug] }]));
