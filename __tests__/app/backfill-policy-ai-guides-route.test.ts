import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), backfill: vi.fn() }));
vi.mock("@/lib/admin-auth-server", () => ({ requireAdminUser: mocks.user }));
vi.mock("@/lib/policy/draft-backfill", () => ({ backfillPolicyDrafts: mocks.backfill }));
import { POST } from "@/app/api/admin/backfill-policy-ai-guides/route";
const id = "3c0550cc-381c-4d84-81bd-a307394cccc3";
const req = (body: unknown) => new Request("https://www.keepioo.com/api/admin/backfill-policy-ai-guides", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { mocks.user.mockResolvedValue({ id: "운영자" }); mocks.backfill.mockReset(); });
it("로그인 전에는 보충 작업을 실행하지 않는다", async () => {
  mocks.user.mockResolvedValue(null); expect((await POST(req({ type: "welfare", ids: [id] }))).status).toBe(401);
  expect(mocks.backfill).not.toHaveBeenCalled();
});
it("대상을 지정하지 않은 대량 설명 생성 요청은 거절한다", async () => {
  expect((await POST(req({ type: "both", limit: 2000 }))).status).toBe(400);
  expect(mocks.backfill).not.toHaveBeenCalled();
});
it("선택한 정책만 초안 작성 단계로 보낸다", async () => {
  mocks.backfill.mockResolvedValue({ drafted: 1 });
  expect((await POST(req({ type: "welfare", ids: [id] }))).status).toBe(200);
  expect(mocks.backfill).toHaveBeenCalledWith("welfare_programs", 10, [id]);
});
it("저장소 오류를 성공으로 숨기지 않는다", async () => {
  mocks.backfill.mockRejectedValue(new Error("준비 전"));
  expect((await POST(req({ type: "welfare", ids: [id] }))).status).toBe(503);
});
