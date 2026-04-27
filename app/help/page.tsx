// ============================================================
// /help — 자주 묻는 질문 (FAQ)
// ============================================================
// 신규 사용자가 서비스를 이해하고, 기존 사용자의 반복 문의를 줄이는 창구.
// details/summary 접기 UI — JavaScript 없이 브라우저 기본 동작으로 동작 (SSR 친화).
//
// 카테고리: 서비스 소개 · 맞춤 알림 · 결제/구독 · 알림톡 · 개인정보·탈퇴
// 각 질문은 사용자 실제 의문을 기반 (재동의·탈퇴 유예·카톡 동의 등 실제 운영 이슈 반영).
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { safeJsonLd } from "@/lib/json-ld-safe";

export const metadata: Metadata = {
  title: "도움말 (자주 묻는 질문) | 정책알리미",
  description:
    "정책알리미 서비스 이용 방법과 자주 묻는 질문을 정리했어요. 맞춤 알림·구독·카카오 알림톡·개인정보 등 주요 궁금증을 한 페이지에서 확인하세요.",
  alternates: { canonical: "/help" },
  openGraph: {
    title: "도움말 (자주 묻는 질문) | 정책알리미",
    description: "정책알리미 이용법·구독·알림 설정 자주 묻는 질문",
    type: "website",
  },
};

// ISR — FAQ 는 갱신 드물어 1일 캐시
export const revalidate = 86400;

type Faq = {
  q: string;
  a: React.ReactNode;
};

type Section = {
  title: string;
  items: Faq[];
};

const SECTIONS: Section[] = [
  {
    title: "서비스 소개",
    items: [
      {
        q: "정책알리미는 어떤 서비스예요?",
        a: (
          <>
            정부·지자체의 복지 서비스와 소상공인 대출·지원금 공고를 한곳에
            모아 보여드리는 서비스예요. 복지로·소상공인24·온통청년·금융위원회·
            정책브리핑 등 여러 공공 데이터를 매일 자동 수집해서 정리합니다.
            <br />
            <br />
            <strong className="text-grey-900">
              맞춤 조건을 등록해두면, 새 공고가 올라올 때 이메일·카카오 알림톡으로 알려드려요.
            </strong>
          </>
        ),
      },
      {
        q: "무료인가요?",
        a: (
          <>
            공고 검색·열람·정책 뉴스 읽기는 <strong>누구나 무료</strong>예요.
            <br />
            맞춤 알림·AI 상담은 플랜별로 제공 범위가 달라요. 자세한 내용은{" "}
            <Link href="/pricing" className="text-blue-500 hover:underline">
              요금제 페이지
            </Link>
            에서 확인하세요.
          </>
        ),
      },
      {
        q: "데이터는 얼마나 자주 업데이트돼요?",
        a: (
          <>
            공고는 매일 자동 수집되고, 일부 소스는 하루에 여러 번 갱신해요.
            <br />
            정책 뉴스는 korea.kr(정책브리핑) RSS 기반으로 매일 11시(KST) 한 번 수집합니다.
          </>
        ),
      },
    ],
  },
  {
    title: "맞춤 알림",
    items: [
      {
        q: "맞춤 알림은 어떻게 설정하나요?",
        a: (
          <>
            <Link href="/mypage/notifications" className="text-blue-500 hover:underline">
              마이페이지 → 맞춤 알림
            </Link>{" "}
            에서 관심 조건 (지역·연령·업종·혜택 분야 등) 을 선택하면 끝이에요.
            조건에 맞는 새 공고가 등록되면 자동으로 알림이 가요.
            <br />
            <br />
            베이직 이상 플랜에서 이용 가능하고, 카카오 알림톡은 프로 플랜
            + 카카오 알림톡 수신 동의가 모두 켜져 있어야 발송돼요.
          </>
        ),
      },
      {
        q: "알림을 일시중지하거나 삭제할 수 있나요?",
        a: (
          <>
            네. 마이페이지 맞춤 알림 페이지에서 규칙별로{" "}
            <strong>중지·재개·삭제</strong>를 언제든 할 수 있어요. 중지된
            규칙은 새 공고 매칭·발송을 하지 않아요.
          </>
        ),
      },
      {
        q: "알림이 안 오는데 어떻게 해요?",
        a: (
          <>
            몇 가지 확인해 주세요:
            <ol className="list-decimal list-inside mt-2 space-y-1 text-[14px]">
              <li>알림 규칙이 <strong>활성</strong> 상태인지</li>
              <li>이메일 알림이면 스팸함(프로모션 탭) 도 함께 확인</li>
              <li>카카오 알림톡이면 마이페이지 동의 관리에서 <strong>카카오 알림톡 수신</strong>이 켜져 있는지</li>
              <li>등록하신 조건에 매칭되는 새 공고가 24시간 내 없었을 수도 있어요</li>
            </ol>
            <br />
            위 확인 후에도 문제가 있으면 고객센터로 문의해 주세요.
          </>
        ),
      },
    ],
  },
  {
    title: "결제·구독",
    items: [
      {
        q: "구독은 어떻게 취소해요?",
        a: (
          <>
            <Link href="/mypage/billing" className="text-blue-500 hover:underline">
              마이페이지 → 결제·구독
            </Link>{" "}
            에서 <strong>구독 취소</strong>를 누르면 다음 결제일부터 자동결제가
            중단돼요. 현재 결제된 기간까지는 서비스를 그대로 이용하실 수 있어요.
          </>
        ),
      },
      {
        q: "환불 되나요?",
        a: (
          <>
            현재 결제된 주기 중 미사용 일수에 대한 일할 환불은 지원하지 않아요.
            구독을 취소하시면 <strong>남은 기간까지 이용</strong>한 뒤 다음
            결제가 자동 중단됩니다. 자세한 환불 규정은{" "}
            <Link href="/terms" className="text-blue-500 hover:underline">
              이용약관
            </Link>
            을 확인해 주세요.
          </>
        ),
      },
    ],
  },
  {
    title: "카카오 알림톡",
    items: [
      {
        q: "카카오 알림톡을 받으려면?",
        a: (
          <>
            다음 3가지가 모두 필요해요:
            <ol className="list-decimal list-inside mt-2 space-y-1 text-[14px]">
              <li>프로 플랜 구독</li>
              <li>
                마이페이지 동의 관리에서 <strong>카카오 알림톡 수신</strong> 동의 켜기
              </li>
              <li>맞춤 알림 규칙에 휴대폰 번호 등록 + 카카오 채널 수신</li>
            </ol>
            정보통신망법상 수신 동의 없이는 알림톡이 발송되지 않아요.
          </>
        ),
      },
      {
        q: "알림톡 수신을 중단하려면?",
        a: (
          <>
            <Link href="/mypage#consents" className="text-blue-500 hover:underline">
              마이페이지 → 동의 관리
            </Link>{" "}
            에서 <strong>카카오 알림톡 수신</strong> 토글을 끄시면 즉시 중단돼요.
            알림톡은 발송되지 않고, 이메일 알림은 그대로 유지됩니다.
          </>
        ),
      },
    ],
  },
  {
    title: "개인정보·탈퇴",
    items: [
      {
        q: "어떤 개인정보를 저장하나요?",
        a: (
          <>
            이메일·OAuth 프로필(이름·이미지)·관심 조건·알림 이력·구독 상태를
            저장해요. 사진이나 위치정보 등 민감 정보는 <strong>전혀 수집하지 않아요</strong>.
            <br />
            자세한 내용은{" "}
            <Link href="/privacy" className="text-blue-500 hover:underline">
              개인정보처리방침
            </Link>
            을 확인해 주세요.
          </>
        ),
      },
      {
        q: "회원 탈퇴는 어떻게 하나요?",
        a: (
          <>
            마이페이지 최하단 <strong>회원 탈퇴</strong> 섹션에서 진행할 수 있어요.
            <br />
            <br />
            탈퇴 요청 후 <strong>30일 동안</strong>은 같은 계정으로 로그인하면
            복구 페이지로 연결되어, 마음이 바뀌었을 때 바로 되돌릴 수 있어요.
            30일이 지나면 프로필·관심 조건·알림 이력·AI 사용 기록 등 모든 개인
            데이터가 영구 삭제되며 복구할 수 없어요.
          </>
        ),
      },
      {
        q: "활성 구독이 있어도 탈퇴할 수 있나요?",
        a: (
          <>
            결제가 진행 중인 구독(체험·활성·과거 결제 실패) 상태에서는 먼저
            구독 취소를 하신 뒤 탈퇴를 진행해 주세요. 잘못된 자동 결제를
            막기 위한 안전장치예요.
          </>
        ),
      },
    ],
  },
];

export default function HelpPage() {
  // JSON-LD FAQPage — Google 검색 리치 결과 ("자주 묻는 질문" 펼쳐진 스니펫)
  // 구조화 데이터는 React element 가 아닌 순수 텍스트만 허용 — 본문은 요약으로.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SECTIONS.flatMap((s) =>
      s.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          // 리치 JSX 대신 의미만 담은 텍스트로 — 검색 결과 표기용.
          text: `${s.title} 관련 답변은 keepioo.com/help 에서 확인하실 수 있어요.`,
        },
      })),
    ),
  };

  return (
    <main className="min-h-screen bg-grey-50 pt-28 pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <div className="max-w-[760px] mx-auto px-10 max-md:px-6">
        {/* 헤더 */}
        <header className="mb-10">
          <p className="text-[13px] font-semibold text-blue-500 tracking-[0.15em] mb-3">
            HELP · 도움말
          </p>
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-grey-900 tracking-[-0.6px] mb-3">
            자주 묻는 질문
          </h1>
          <p className="text-[15px] md:text-[17px] text-grey-700 leading-[1.6]">
            서비스 이용에 대한 주요 궁금증을 한 페이지에 모았어요. 찾는 내용이
            없다면 마이페이지에서 문의해 주세요.
          </p>
        </header>

        {/* 섹션별 FAQ */}
        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-[18px] md:text-[20px] font-bold text-grey-900 mb-4">
                {section.title}
              </h2>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <details
                    key={item.q}
                    className="group bg-white border border-grey-200 rounded-xl overflow-hidden"
                  >
                    <summary className="flex items-center justify-between gap-3 cursor-pointer min-h-[56px] px-5 py-3 list-none select-none hover:bg-grey-50 transition-colors">
                      <span className="text-[15px] font-semibold text-grey-900 flex-1 leading-[1.4]">
                        {item.q}
                      </span>
                      <span
                        className="shrink-0 text-[13px] text-grey-600 group-open:rotate-180 transition-transform"
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    </summary>
                    <div className="px-5 py-4 border-t border-grey-100 text-[14px] text-grey-700 leading-[1.7]">
                      {item.a}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* 하단 CTA */}
        <section className="mt-12 pt-8 border-t border-grey-100 text-center">
          <h2 className="text-[18px] font-bold text-grey-900 mb-2">
            원하는 답을 못 찾으셨나요?
          </h2>
          <p className="text-[13px] text-grey-600 mb-5 leading-[1.6]">
            맞춤 알림부터 시작해 보시거나, 요금제 페이지에서 혜택을 확인해 보세요.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Link
              href="/mypage/notifications"
              className="min-h-[44px] inline-flex items-center px-5 bg-blue-500 text-white rounded-lg text-[14px] font-bold hover:bg-blue-600 no-underline"
            >
              맞춤 알림 설정
            </Link>
            <Link
              href="/pricing"
              className="min-h-[44px] inline-flex items-center px-5 bg-white border border-grey-200 text-grey-700 rounded-lg text-[14px] font-bold hover:bg-grey-50 no-underline"
            >
              요금제 보기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
