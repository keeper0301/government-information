import type { Metadata } from "next";
import { PRIVACY_POLICY_VERSION } from "@/lib/consent";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 정책알리미",
};

// ============================================================
// /privacy — 개인정보처리방침
// ============================================================
// 카카오 비즈 앱 전환·이메일 수집·관심분야 저장·카톡 알림·토스 결제 등
// 신규 처리 항목 모두 반영. 버전: lib/consent.ts 의 PRIVACY_POLICY_VERSION.
//
// 방침 개정 시:
//   1) lib/consent.ts 의 PRIVACY_POLICY_VERSION 상수 변경
//   2) 본문 수정
//   3) 사용자에게 재동의 요청 (다음 로그인 시 동의 화면)
// ============================================================

export default function PrivacyPage() {
  return (
    <main className="pt-28 pb-20 max-w-content mx-auto px-10 max-md:px-6">
      <h1 className="text-[28px] font-bold tracking-[-1px] text-grey-900 mb-2">
        개인정보처리방침
      </h1>
      <p className="text-[13px] text-grey-600 mb-8">
        시행일자: {PRIVACY_POLICY_VERSION} · 운영자: 키피오 (사업자등록번호 657-24-02265)
      </p>

      <div className="text-[15px] text-grey-700 leading-[1.8] space-y-7">
        <Section title="1. 수집하는 개인정보 항목">
          <p>정책알리미(이하 "서비스")는 회원가입·서비스 이용·문의 대응을 위해 다음 정보를 수집합니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><b>필수</b>: 이메일 주소, 비밀번호 또는 소셜 로그인 식별자</li>
            <li><b>선택</b>: 닉네임, 프로필 사진, 나이대, 거주 지역, 직업, 관심 분야</li>
            <li><b>알림 수신</b>: 휴대폰 번호 (카카오 알림톡 또는 SMS 수신 동의 시)</li>
            <li><b>결제</b>: 카드 정보는 토스페이먼츠에 직접 저장되며 서비스는 빌링키만 보관</li>
            <li><b>자동 수집</b>: IP 주소, 쿠키, 접속 로그, 기기·브라우저 정보 (이용 분석·보안 목적)</li>
          </ul>
        </Section>

        <Section title="2. 수집 방법">
          <ul className="list-disc pl-6 space-y-1">
            <li>회원가입 폼, 마이페이지 입력</li>
            <li>카카오 / 구글 소셜 로그인 (사용자 동의 후 카카오·구글이 제공)</li>
            <li>토스페이먼츠 결제 흐름 (빌링키 발급 시)</li>
            <li>서비스 이용 중 자동 생성·수집 (쿠키, 로그)</li>
          </ul>
        </Section>

        <Section title="3. 개인정보의 이용 목적">
          <ul className="list-disc pl-6 space-y-1">
            <li>회원 식별·인증, 부정 이용 방지</li>
            <li>맞춤 정책 추천·매칭, 관심 분야 기반 알림 발송</li>
            <li>마감 임박 정책 알림 (이메일·카카오 알림톡·SMS)</li>
            <li>유료 구독 결제 처리 및 정기결제 갱신</li>
            <li>고객 문의 대응 및 서비스 운영 안내</li>
            <li>서비스 개선을 위한 통계 분석 (개인 식별 정보는 익명화)</li>
          </ul>
        </Section>

        <Section title="4. 보유 및 이용 기간">
          <ul className="list-disc pl-6 space-y-1">
            <li>회원 정보: 회원 탈퇴 시까지. 탈퇴 즉시 모든 정보 파기 (단 법령상 의무 보존 분 제외)</li>
            <li>결제 기록: 전자상거래법에 따라 5년 보관</li>
            <li>접속 로그: 통신비밀보호법에 따라 3개월 보관</li>
            <li>알림 발송 이력: 회원 탈퇴 후 30일 보관 (분쟁 대응)</li>
            <li>동의 이력: 회원 탈퇴 후 5년 보관 (개정·철회 입증)</li>
          </ul>
        </Section>

        <Section title="5. 제3자 제공 및 처리 위탁">
          <p>서비스는 사용자 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만 서비스 운영을 위해 다음 처리자에게 일부 정보 처리를 위탁합니다.</p>
          <table className="w-full mt-3 text-[14px] border border-grey-200">
            <thead className="bg-grey-50">
              <tr>
                <th className="text-left p-2 border-b border-grey-200">위탁받는 자</th>
                <th className="text-left p-2 border-b border-grey-200">위탁 업무</th>
                <th className="text-left p-2 border-b border-grey-200">제공 정보</th>
              </tr>
            </thead>
            <tbody>
              <Row k="Supabase Inc." w="회원 인증·DB 호스팅" d="이메일, 인증 토큰, 프로필" />
              <Row k="Vercel Inc." w="웹 서비스 호스팅" d="접속 로그, IP" />
              <Row k="Resend Inc." w="이메일 발송" d="이메일 주소, 메시지 본문" />
              <Row k="토스페이먼츠" w="결제 처리·정기결제" d="이름, 카드 정보(직접 저장), 결제 금액" />
              <Row k="카카오" w="소셜 로그인·알림톡 발송" d="카카오 ID, 닉네임, 이메일, 휴대폰" />
              <Row k="OpenAI / Google AI" w="AI 정책 상담" d="질문 텍스트 (개인정보 미포함)" />
              <Row k="Google" w="이용 분석 (GA4) · 광고 (AdSense)" d="익명 사용 통계, 광고 식별자" />
            </tbody>
          </table>
          <p className="text-[13px] text-grey-600 mt-2">위탁받은 자는 위탁 목적 외 사용·재제공이 금지되며, 위탁 종료 시 보유 정보를 즉시 파기합니다.</p>
        </Section>

        <Section title="6. 동의 철회 및 정보 수정·삭제">
          <ul className="list-disc pl-6 space-y-1">
            <li>마이페이지에서 언제든 관심 분야·알림 채널·구독 상태를 수정할 수 있습니다.</li>
            <li>회원 탈퇴는 마이페이지 → 계정 설정에서 가능합니다. 탈퇴 즉시 모든 식별 정보 파기.</li>
            <li>카카오 / 구글 소셜 로그인의 연결 해제는 각 서비스의 설정에서 직접 가능합니다.</li>
            <li>마케팅 수신 동의는 알림 메일 하단의 "수신 거부" 또는 마이페이지에서 철회 가능.</li>
          </ul>
        </Section>

        <Section title="7. 안전성 확보 조치">
          <ul className="list-disc pl-6 space-y-1">
            <li>비밀번호는 단방향 해시로 저장. 평문 비밀번호 미보관.</li>
            <li>전송 구간 TLS 1.2 이상 암호화 (HTTPS).</li>
            <li>DB 접근은 Row Level Security 로 본인 데이터만 조회 가능.</li>
            <li>관리자 페이지는 환경변수 화이트리스트 기반 접근 제한.</li>
            <li>결제 카드 정보는 서비스가 보관하지 않으며, 토스페이먼츠 PCI DSS 인증 인프라에만 저장.</li>
          </ul>
        </Section>

        <Section title="8. 만 14세 미만 아동의 개인정보">
          <p>서비스는 만 14세 미만 아동의 회원 가입을 받지 않습니다. 가입 시 만 14세 이상임을 확인합니다.</p>
        </Section>

        <Section title="9. 개인정보처리방침의 변경">
          <p>방침 내용이 변경될 경우, 변경 사항을 서비스 공지사항을 통해 안내하며, 중대한 변경의 경우 다음 로그인 시 재동의를 요청합니다. 모든 동의 시점·버전은 시스템에 기록되어 사용자가 마이페이지에서 조회할 수 있습니다.</p>
          <p className="mt-2 text-[13px] text-grey-600">현재 버전: <b>{PRIVACY_POLICY_VERSION}</b></p>
        </Section>

        <Section title="10. 문의처">
          <p>개인정보 관련 문의는 <a href="mailto:keeper0301@gmail.com" className="text-blue-500 underline">keeper0301@gmail.com</a> 으로 연락주세요. 영업일 기준 3일 이내 답변드립니다.</p>
        </Section>
      </div>
    </main>
  );
}

// ━━━ 작은 컴포넌트 ━━━

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-bold text-grey-900 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ k, w, d }: { k: string; w: string; d: string }) {
  return (
    <tr>
      <td className="p-2 border-b border-grey-100 align-top font-medium text-grey-900">{k}</td>
      <td className="p-2 border-b border-grey-100 align-top">{w}</td>
      <td className="p-2 border-b border-grey-100 align-top text-grey-600 text-[13px]">{d}</td>
    </tr>
  );
}
