import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NewsCard, type NewsCardData } from "@/components/news-card";

let container: HTMLDivElement;
let root: Root;

const basePost: NewsCardData = {
  slug: "test-news",
  title: "테스트 정책 뉴스",
  summary: "요약입니다",
  category: "news",
  ministry: "행정안전부",
  source_outlet: null,
  thumbnail_url: "https://www.korea.kr/example.jpg",
  published_at: "2026-07-17",
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("NewsCard", () => {
  it("외부 언론사 썸네일은 요청하지 않고 placeholder 를 바로 노출한다", () => {
    act(() => {
      root.render(
        <NewsCard
          post={{
            ...basePost,
            source_outlet: "example.com",
            thumbnail_url: "https://expired.example.com/image.jpg",
          }}
        />,
      );
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("허용된 first-party 썸네일 로드 실패 시 placeholder 를 노출한다", () => {
    act(() => {
      root.render(<NewsCard post={basePost} />);
    });

    const image = container.querySelector("img") as HTMLImageElement;
    expect(image).toBeTruthy();
    const fallback = image.nextElementSibling as HTMLElement;
    expect(fallback.classList.contains("hidden")).toBe(true);

    act(() => {
      image.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(image.classList.contains("hidden")).toBe(true);
    expect(fallback.classList.contains("hidden")).toBe(false);
  });
});
