import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/welfare/demo",
  useRouter: () => ({ replace: () => undefined }),
}));

vi.mock("@/lib/policy/detail-viewer", () => ({
  loadDetailViewer: async () => ({ loggedIn: false, matchCount: null }),
}));

vi.mock("@/lib/nav/nav-auth-state", () => ({
  getNavAuthState: async () => ({ loggedIn: false, isAdmin: false, alarmCount: 0 }),
}));

import { ApplyActionDetail } from "@/components/policy/apply-action-detail";
import { DetailSignupCardView } from "@/components/policy/detail-signup-card";
import type { ApplyActionInput } from "@/lib/policy/apply-action-model";

const input: ApplyActionInput = {
  title: "장수축하금",
  target: "노년·어르신",
  region: "인천광역시",
  district: "계양구",
  source: "인천광역시",
  sourceUrl: "https://www.incheon.go.kr/notice/123",
  updatedAt: "2026-04-22",
  eligibility: "계양구 1년 이상 거주 100세 어르신",
  benefits: "1인 100만원 (1회)",
  loanAmount: null,
  interestRate: null,
  applyMethod: "주소지 관할 동 행정복지센터에 방문",
  applyUrl: null,
  applyStart: null,
  applyEnd: null,
  contactInfo: "계양구청 노인장애인과 032-450-5388",
  description: "지급 안내",
  detailedContent: "생일 달 말일에 입금합니다.",
  selectionCriteria: null,
  requiredDocuments: null,
  repaymentPeriod: null,
  dday: null,
  isClosed: false,
};

describe("ApplyActionDetail", () => {
  it("방문 카드에 전화와 알림톡, 접힌 원문을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <ApplyActionDetail
        {...input}
        kind="welfare"
        programId="ae7c4623-0000-4000-8000-000000000001"
        sourcePage="/welfare/ae7c4623-0000-4000-8000-000000000001"
        guide={null}
        reviewCheckedAt={null}
        reviewReviewedAt={null}
      />,
    );

    expect(html).toContain("한 줄 요약");
    expect(html).toContain("신청은 이렇게 해요");
    expect(html).toContain("믿을 수 있는 정보인가요?");
    expect(html).toContain("부모님이 받을 수 있는 지원, 또 있을지 몰라요");
    expect(html).toContain("내 조건으로 더 찾기 (무료)");
    expect(html).toContain("원문 전체 보기");
    expect(html).toContain("생일 달 말일에 입금합니다.");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("tel:0324505388");
    expect(html).toContain("신청 방법 알림톡 받기");
    expect(html).toContain("📞 전화 문의");
    expect(html).not.toContain("원문 확인일");
    expect(html).not.toContain("사람 검수일");
    expect(html).not.toContain("검수 중");
    expect(html).not.toContain("신청 기간 확인 필요");
  });

  it("로그인 상태에서는 조건에 맞는 지원 개수를 보여 준다", () => {
    const html = renderToStaticMarkup(
      <DetailSignupCardView audience="self" viewer={{ loggedIn: true, matchCount: 12 }} />,
    );
    expect(html).toContain("내 조건에 맞는 지원 12개");
    expect(html).not.toContain("부모님");
  });

  it("조건이 없는 로그인 사용자는 개수를 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <DetailSignupCardView audience="parent" viewer={{ loggedIn: true, matchCount: null }} />,
    );
    expect(html).toContain("내 조건에 맞는 지원");
    expect(html).not.toMatch(/\d+개/);
    expect(html).toContain("지역·나이를 고르면 개수를 보여드려요.");
  });
});
