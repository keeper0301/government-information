import { describe, it, expect } from "vitest";
import { rowToGuide } from "@/lib/policy-guides";

describe("rowToGuide", () => {
  it("supabase row 를 PolicyGuide 로 변환", () => {
    const row = {
      id: "uuid-1",
      slug: "loan-12345",
      title: "테스트 정책",
      program_id: "12345",
      program_type: "loan",
      post_1: "1편",
      post_2: "2편",
      post_3: "3편",
      post_4: "4편",
      post_5: "5편",
      rotation_idx: 0,
      threads_url: "https://t.co/abc",
      og_image_url: null,
      published_at: "2026-04-27T03:30:00Z",
      updated_at: "2026-04-27T03:30:00Z",
    };
    const guide = rowToGuide(row);
    expect(guide.slug).toBe("loan-12345");
    expect(guide.programType).toBe("loan");
    expect(guide.posts).toEqual(["1편", "2편", "3편", "4편", "5편"]);
    expect(guide.threadsUrl).toBe("https://t.co/abc");
    expect(guide.ogImageUrl).toBeNull();
    expect(guide.rotationIdx).toBe(0);
  });

  it("welfare 타입도 정상 변환", () => {
    const row = {
      id: "uuid-2",
      slug: "welfare-99",
      title: "복지 정책",
      program_id: "99",
      program_type: "welfare",
      post_1: "a",
      post_2: "b",
      post_3: "c",
      post_4: "d",
      post_5: "e",
      rotation_idx: null,
      threads_url: null,
      og_image_url: "https://example.com/og.png",
      published_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    };
    const guide = rowToGuide(row);
    expect(guide.programType).toBe("welfare");
    expect(guide.rotationIdx).toBeNull();
    expect(guide.ogImageUrl).toBe("https://example.com/og.png");
  });
});
