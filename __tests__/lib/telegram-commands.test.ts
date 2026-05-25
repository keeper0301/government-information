import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchCommand } from "@/lib/telegram/commands";

const statusCommand = vi.hoisted(() => vi.fn());
const triggerCommand = vi.hoisted(() => vi.fn());
const healthCommand = vi.hoisted(() => vi.fn());
const publishBlogCommand = vi.hoisted(() => vi.fn());
const publishPreviewCommand = vi.hoisted(() => vi.fn());
const publishIndexnowCommand = vi.hoisted(() => vi.fn());

vi.mock("@/lib/telegram/admin/operate", () => ({
  revokeCommand: vi.fn(),
  restoreCommand: vi.fn(),
  statusCommand,
  triggerCommand,
  recentCommand: vi.fn(),
}));

vi.mock("@/lib/telegram/admin/info", () => ({
  newsListCommand: vi.fn(),
  healthCommand,
  todayCommand: vi.fn(),
  statsCommand: vi.fn(),
  adminLinksCommand: vi.fn(),
}));

vi.mock("@/lib/telegram/admin/content", () => ({
  publishBlogCommand,
  publishPreviewCommand,
  publishIndexnowCommand,
}));

vi.mock("@/lib/telegram/admin/press", () => ({
  pressListCommand: vi.fn(),
  pressLowListCommand: vi.fn(),
  pressConfirmCommand: vi.fn(),
  pressDismissCommand: vi.fn(),
}));

vi.mock("@/lib/telegram/admin/queue", () => ({ queueCommand: vi.fn() }));
vi.mock("@/lib/telegram/admin/user", () => ({ userLookupCommand: vi.fn() }));
vi.mock("@/lib/telegram/admin/dedupe", () => ({
  dedupeListCommand: vi.fn(),
  dedupeConfirmCommand: vi.fn(),
  dedupeRejectCommand: vi.fn(),
}));
vi.mock("@/lib/telegram/admin/decide", () => ({
  decideListCommand: vi.fn(),
  decideApproveCommand: vi.fn(),
  decideRejectCommand: vi.fn(),
  decideConsultCommand: vi.fn(),
}));
vi.mock("@/lib/telegram/admin/vercel", () => ({
  envListCommand: vi.fn(),
  envSetCommand: vi.fn(),
  redeployCommand: vi.fn(),
}));

function ownerCommand(text: string, cronAuthorizationHeader: string | null) {
  return dispatchCommand({
    chatId: 1,
    text,
    cronAuthorizationHeader,
    role: "owner",
  });
}

describe("dispatchCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    statusCommand.mockResolvedValue("status ok");
    triggerCommand.mockResolvedValue("trigger ok");
    healthCommand.mockResolvedValue("health ok");
    publishBlogCommand.mockResolvedValue("publish blog ok");
    publishPreviewCommand.mockResolvedValue("publish preview ok");
    publishIndexnowCommand.mockResolvedValue("indexnow ok");
  });

  it("상태 명령에 완성된 크론 인증 헤더를 전달한다", async () => {
    const reply = await ownerCommand("/status", "Bearer right-secret");

    expect(reply).toBe("status ok");
    expect(statusCommand).toHaveBeenCalledWith("Bearer right-secret");
  });

  it("트리거 명령에 인자와 크론 인증 헤더를 전달한다", async () => {
    const reply = await ownerCommand("/trigger health-alert", "Bearer right-secret");

    expect(reply).toBe("trigger ok");
    expect(triggerCommand).toHaveBeenCalledWith("health-alert", "Bearer right-secret");
  });

  it("발행 하위 명령에 크론 인증 헤더를 전달한다", async () => {
    await ownerCommand("/publish blog 청년", "Bearer right-secret");
    await ownerCommand("/publish preview 노년", "Bearer right-secret");
    await ownerCommand("/publish indexnow", "Bearer right-secret");

    expect(publishBlogCommand).toHaveBeenCalledWith("청년", "Bearer right-secret");
    expect(publishPreviewCommand).toHaveBeenCalledWith("노년", "Bearer right-secret");
    expect(publishIndexnowCommand).toHaveBeenCalledWith("Bearer right-secret");
  });

  it("헬스 명령에 크론 인증 헤더 null도 그대로 전달한다", async () => {
    const reply = await ownerCommand("/health", null);

    expect(reply).toBe("health ok");
    expect(healthCommand).toHaveBeenCalledWith(null);
  });
});
