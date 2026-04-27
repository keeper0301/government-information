// ============================================================
// JSON-LD safe stringifier — XSS 차단
// ============================================================
// `<script type="application/ld+json">` 안에 dangerouslySetInnerHTML 로 JSON 을
// 주입할 때, 데이터에 `</script>` 같은 시퀀스가 들어 있으면 HTML parser 가
// script 태그 종료로 해석 → 이후 임의 markup 실행 가능 (XSS).
//
// 예) DB 의 정책 제목·뉴스 제목·FAQ 답변은 외부 API → 우리 DB 통과해 들어옴.
//     수집기가 정제 안 한 < 시퀀스가 schema 안에 그대로 흘러갈 위험 존재.
//
// 대응: `<` 를 `<` 로 escape. JSON 의 의미는 그대로 보존되고
// (JSON.parse 정상), HTML parser 는 더 이상 `</script>` 로 해석 안 함.
//
// Next.js 공식 권장 패턴:
//   https://nextjs.org/docs/app/guides/json-ld
// ============================================================

/**
 * JSON-LD 페이로드를 XSS 안전하게 stringify.
 * `<script>` 안 dangerouslySetInnerHTML 의 __html 값으로 사용.
 */
export function safeJsonLd(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}
