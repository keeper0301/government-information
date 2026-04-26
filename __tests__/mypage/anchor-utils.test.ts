import { describe, it, expect } from "vitest";
import {
  hashToTab,
  isValidTab,
  normalizeTab,
} from "@/app/mypage/anchor-utils";

describe("hashToTab", () => {
  it("#consents 를 consents 로 변환", () => {
    expect(hashToTab("#consents")).toBe("consents");
  });
  it("#account 를 account 로 변환", () => {
    expect(hashToTab("#account")).toBe("account");
  });
  it("#profile 또는 빈 hash 는 profile 로", () => {
    expect(hashToTab("#profile")).toBe("profile");
    expect(hashToTab("")).toBe("profile");
    expect(hashToTab("#")).toBe("profile");
  });
  it("알 수 없는 hash 는 null", () => {
    expect(hashToTab("#unknown")).toBeNull();
  });
});

describe("isValidTab", () => {
  it("유효한 탭 값만 true", () => {
    expect(isValidTab("profile")).toBe(true);
    expect(isValidTab("consents")).toBe(true);
    expect(isValidTab("account")).toBe(true);
    expect(isValidTab("hack")).toBe(false);
    expect(isValidTab(null)).toBe(false);
  });
});

describe("normalizeTab", () => {
  it("유효한 값 그대로, 무효한 값은 profile", () => {
    expect(normalizeTab("consents")).toBe("consents");
    expect(normalizeTab("garbage")).toBe("profile");
    expect(normalizeTab(null)).toBe("profile");
  });
});
