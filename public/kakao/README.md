# 카카오 브랜드 자산

자동 생성된 PNG — `node scripts/generate-kakao-assets.mjs` 로 재생성.

## 파일

| 파일 | 크기 | 용도 |
|---|---|---|
| app-icon-1024.png | 1024×1024 | 카카오 개발자 콘솔 앱 아이콘 (카카오 로그인 동의화면·카카오톡 공유 카드 등) |
| brand-image-1200x630.png | 1200×630 | 카카오비즈 채널 커버 / OG 이미지 대체 등 |

## 업로드 위치

- **카카오 개발자 콘솔** (https://developers.kakao.com) → 내 애플리케이션 → 앱 설정 → 일반 → 앱 아이콘 → `app-icon-1024.png` 업로드
- **카카오비즈니스 / 카카오 채널** (https://business.kakao.com) → 채널 관리 → 채널 정보 → 프로필 이미지(`app-icon-1024.png`), 커버 이미지(`brand-image-1200x630.png`)

주의: 원본 SVG(`app/apple-icon.svg`, `public/logo.svg`) 의 브랜드 폰트(Bodoni Moda 등) 가 빌드 환경에 없으면 fallback serif 로 렌더됨. 결과 확인 후 필요 시 폰트 설치 또는 디자이너에게 PNG 직접 요청.
