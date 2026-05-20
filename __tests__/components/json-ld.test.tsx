import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FAQSchema } from "@/components/json-ld";

function parseJsonLd(markup: string) {
  const match = markup.match(
    /<script type="application\/ld\+json">([\s\S]*)<\/script>/,
  );
  if (!match) throw new Error("JSON-LD script not found");
  return JSON.parse(match[1]) as {
    mainEntity: Array<{
      name: string;
      acceptedAnswer: { text: string };
    }>;
  };
}

describe("FAQSchema", () => {
  it("FAQ question/answer 에 섞인 HTML 태그를 구조화 데이터에서도 제거한다", () => {
    const markup = renderToStaticMarkup(
      <FAQSchema
        questions={[
          {
            question: "<strong>월 100만 원</strong> 받을 수 있나요?",
            answer:
              "소득 조건에 따라 <em>월 100만 원</em>까지 받을 수 있습니다.",
          },
        ]}
      />,
    );

    expect(markup).not.toContain("<strong");
    expect(markup).not.toContain("<em");
    expect(markup).not.toContain("\\u003cstrong");
    expect(markup).not.toContain("\\u003cem");

    const schema = parseJsonLd(markup);
    expect(schema.mainEntity[0].name).toBe("월 100만 원 받을 수 있나요?");
    expect(schema.mainEntity[0].acceptedAnswer.text).toBe(
      "소득 조건에 따라 월 100만 원까지 받을 수 있습니다.",
    );
  });
});
