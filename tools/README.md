# tools/

git 추적되는 로컬 dev 도구. (참고: `scripts/` 는 gitignored — 사장님 PC 전용 자동화)

## test-viewports.mjs

**반응형 회귀 감지 — 4 viewport × 4 페이지 자동 스크린샷.**

5/13~14 사장님 폴드7 메인 / 태블릿 피드백 후 만든 도구. 미래 반응형 회귀
즉시 감지용.

### 실행

```bash
node tools/test-viewports.mjs                       # localhost:3000 (dev)
node tools/test-viewports.mjs https://www.keepioo.com  # 라이브
```

### 출력

`.viewport-snapshots/` (gitignored) 폴더에 16개 PNG:

- fold7-main/ (884×1700) — 사장님 폴드7 메인
- tablet-portrait/ (768×1024) — 일반 태블릿 세로
- tablet-landscape/ (1024×768) — 태블릿 가로
- desktop/ (1440×900) — PC 비교용

각 viewport 폴더에 `home·welfare·loan·news.png`.

### 미래 회귀 감지 흐름

1. 사장님 반응형 미흡 피드백 받음
2. `node tools/test-viewports.mjs` 실행
3. `.viewport-snapshots/` 열어서 viewport × page matrix 한눈에 확인
4. 문제 viewport 식별 후 className 단계 추가
