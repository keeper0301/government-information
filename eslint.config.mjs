// 이 파일 자체는 룰 정의 코드라 selector·message 안에 'text-grey-400' 문자열이
// 포함될 수밖에 없음 → 자기 자신을 매칭하는 self-trigger false positive 발생.
// 룰 정의 코드는 의도된 코드이므로 파일 전역 disable 로 처리.
/* eslint-disable no-restricted-syntax */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // ━━━ 접근성·WCAG AA 가드 ━━━
    // text-grey-400 (#A9A08D, 대비 2.5:1) 은 WCAG AA 작은 본문(4.5:1)·큰 텍스트(3:1)
    // 모두 미달. placeholder 전용으로만 허용.
    // 본문·메타 텍스트는 text-grey-500+ (WCAG 통과) 사용.
    //
    // 정규식 (?<!:) 로 placeholder:text-grey-400 · group-hover:text-grey-400 같은
    // pseudo-class prefix 는 예외. 장식(SVG 아이콘 색)이나 텍스트 의미 없는 dash 등
    // 정당한 단독 사용은 // eslint-disable-next-line 로 suppress.
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Literal[value=/(?<!:)(?<!\\w)text-grey-400(?!\\w)/]",
          message:
            "text-grey-400 은 WCAG AA 미달(대비 2.5:1). placeholder 전용이며 본문·메타는 text-grey-500+ 사용.",
        },
        {
          selector:
            "TemplateElement[value.raw=/(?<!:)(?<!\\w)text-grey-400(?!\\w)/]",
          message:
            "text-grey-400 은 WCAG AA 미달(대비 2.5:1). placeholder 전용이며 본문·메타는 text-grey-500+ 사용.",
        },
      ],
    },
  },
]);

export default eslintConfig;
