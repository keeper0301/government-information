import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  publishApprovedThreadsCandidates: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/admin-auth-server", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/admin-actions", () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock("@/lib/sns/threads-candidate-publisher", () => ({
  publishApprovedThreadsCandidates: mocks.publishApprovedThreadsCandidates,
}));

import { POST } from "@/app/api/admin/threads-candidates/publish/route";

function req(body: unknown) {
  return new Request("https://www.keepioo.com/api/admin/threads-candidates/publish", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminUser.mockResolvedValue({ id: "admin-1", email: "owner@example.com" });
  mocks.publishApprovedThreadsCandidates.mockResolvedValue([
    {
      title: "2026년 경기 중소기업 홈쇼핑·라이브커머스 방송 송출비 1,500만원 추가지원",
      keyword: "라이브커머스",
      text: "테스트 @keepioo_official 라이브커머스",
      source: "fallback",
      validation: { ok: true, reasons: [], length: 28, hasKeepiooMention: true, hasDirectUrl: false, hasKeyword: true },
      published: false,
    },
  ]);
  mocks.logAdminAction.mockResolvedValue(undefined);
});

describe("threads-candidates publish route", () => {
  it("admin 인증 없으면 fail closed", async () => {
    mocks.requireAdminUser.mockResolvedValue(null);
    const res = await POST(req({ candidates: [{ title: "x" }] }));
    expect(res.status).toBe(401);
    expect(mocks.publishApprovedThreadsCandidates).not.toHaveBeenCalled();
  });

  it("dryRun 기본값으로 후보 draft를 만들고 audit한다", async () => {
    const res = await POST(req({
      candidates: [
        { title: "2026년 경기 중소기업 홈쇼핑·라이브커머스 방송 송출비 1,500만원 추가지원" },
      ],
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, dryRun: true, approved: false, published: 0 });
    expect(mocks.publishApprovedThreadsCandidates).toHaveBeenCalledWith(
      [{ title: "2026년 경기 중소기업 홈쇼핑·라이브커머스 방송 송출비 1,500만원 추가지원", url: null, region: null, applyEnd: null }],
      { dryRun: true, approved: false },
    );
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "admin-1",
      action: "threads_candidate_publish_run",
    }));
  });

  it("approved + dryRun=false 요청값을 publisher에 전달한다", async () => {
    await POST(req({ candidates: [{ title: "2026년 경기 중소·중견 제조기업, 디지털전환 실증으로 공정 혁신" }], dryRun: false, approved: true }));
    expect(mocks.publishApprovedThreadsCandidates).toHaveBeenCalledWith(
      [{ title: "2026년 경기 중소·중견 제조기업, 디지털전환 실증으로 공정 혁신", url: null, region: null, applyEnd: null }],
      { dryRun: false, approved: true },
    );
  });
});
