// 공식 사이트의 일시적인 연결 오류와 실제 구조 오류를 구분합니다.
import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";
import { openCheorwonPage } from "@/lib/scraping/local-press/cheorwon-browser";

describe("철원 접속 재시도", () => {
  it("일시적으로 끊긴 연결을 다시 열어 성공한다", async () => {
    const goto = vi.fn().mockRejectedValueOnce(new Error("ERR_CONNECTION_TIMED_OUT")).mockResolvedValue(null);
    await openCheorwonPage({ goto } as unknown as Page, "https://www.cwg.go.kr/www/index.do");
    expect(goto).toHaveBeenCalledTimes(2);
  });

  it("계속 끊기는 연결은 두 번 뒤 실패를 전달한다", async () => {
    const goto = vi.fn().mockRejectedValue(new Error("ERR_CONNECTION_TIMED_OUT"));
    await expect(openCheorwonPage({ goto } as unknown as Page, "https://www.cwg.go.kr/www/index.do")).rejects.toThrow("ERR_CONNECTION_TIMED_OUT");
    expect(goto).toHaveBeenCalledTimes(2);
  });

  it("인증서 오류는 재시도하거나 무시하지 않는다", async () => {
    const goto = vi.fn().mockRejectedValue(new Error("ERR_CERT_AUTHORITY_INVALID"));
    await expect(openCheorwonPage({ goto } as unknown as Page, "https://www.cwg.go.kr/www/index.do")).rejects.toThrow("ERR_CERT_AUTHORITY_INVALID");
    expect(goto).toHaveBeenCalledTimes(1);
  });
});
