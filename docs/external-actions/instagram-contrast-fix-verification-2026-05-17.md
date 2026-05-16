# 인스타 카드 contrast fix 검수 가이드 (5/17 이후)

> **작성일**: 2026-05-16
> **대상**: 사장님 직접 액션 (모바일 + 외부 콘솔)
> **사전 조건**: 5/16 contrast 도메인 5 commit 마감
> **commits**: `163e3a6` · `10e8cf3` · `75d6807` · `9cb8c18` · `33d7733`

## 무엇이 바뀌었나

5/16 오후 ~ 저녁 5 commit 으로 인스타 카드 / OG 이미지 / 네이버 썸네일 / 블로그 hero 의 **카테고리 색상 contrast 사고 8 영역** 사전 차단. 노년 / 문화 / 학생·교육 / 주거 / 큐레이션 카테고리에서 시각 변경 발생.

### 자동 동기화된 색 변경 4 카테고리

| 카테고리 | 옛 hex | 새 hex | 톤 |
|---|---|---|---|
| 학생·교육 | `#18A5A5` (teal-500) | **`#0F766E`** (teal-700) | 약간 darker teal |
| 주거 | `#03B26C` (green-500) | **`#047857`** (emerald-700) | darker emerald |
| 큐레이션 | `#6B7684` (gray) | **`#1F2937`** (slate-800) | 회색 → 진한 슬레이트 |
| 문화 (그라디언트만) | 누락 → DEFAULT | **`#EAB308` + `#B45309`** | toss blue 그라디언트 → amber 그라디언트 |

### 노년·문화 라벨 텍스트 색 분기

노년 `#FE9800` + white text 가 contrast 2.0:1, 문화 `#EAB308` + white = 1.86:1 미달이라 라벨 텍스트 색을 **흰색 → 어두운 슬레이트 #191F28** 으로 분기. 시각적으로 흐릿한 글자 → 또렷한 글자.

## 1. 인스타 cron 가동 결과 (5/17 KST 09:00)

### 1-1. 발행 성공률 확인

```
어드민 → /admin/instagram → 최근 발행 결과 확인
```

**목표**: 발행 성공 (status=success) · Media ID polling fix 효과 (87% → 95%+ 목표).

### 1-2. 카드 시각 검수 (모바일)

인스타 앱 → @keepioo_official → 최근 발행 carousel 클릭.

**중점 점검** (노년 · 문화 카테고리 글이 발행됐을 때):
- 카드 1: 카테고리 pill 배지 글자가 **어두운 색**으로 또렷이 보이는지 (white 였던 자리)
- 카드 1·3 footer `@ keepioo · 정책알리미` · `프로필 링크 → keepioo.com` 글자가 **amber-700/800** 으로 또렷한지 (이전 #FE9800·#EAB308 흐릿했음)
- 카드 3 의 **`keepioo.com`** 대형 텍스트 (fontSize 92) 가 amber 색으로 또렷한지

**학생·교육·주거 글이 발행됐을 때**:
- 카드 배경색이 **약간 더 진한 teal/emerald** 로 변한 게 자연스러운지

**큐레이션 글이 발행됐을 때**:
- 카드 배경이 **진한 슬레이트** (거의 검정) 으로 변한 게 자연스러운지. 이전 회색보다 강조 ↑.

### 1-3. 미달 발견 시

특정 카테고리 시각이 어색하면 텔레그램 `/press low` 또는 어드민에서 직접 보고. 클로드가 색 hex 또는 `to` 값 미세 조정 (예: 큐레이션 그라디언트 효과 평평하면 `to: "#020617"` slate-950 으로).

## 2. SNS 공유 미리보기 (OG image) 재크롤

OG image (`app/blog/[slug]/opengraph-image.tsx`) 가 SNS 공유 미리보기로 노출. SNS 캐시가 24h 라 강제 재크롤 필요.

### 2-1. Facebook · Twitter · 카카오

```
Facebook  : https://developers.facebook.com/tools/debug/
Twitter   : https://cards-dev.twitter.com/validator
카카오톡  : https://developers.kakao.com/tool/debugger/sharing
```

각 도구에 노년 / 문화 / 학생·교육 / 주거 / 큐레이션 카테고리 글 URL 입력 → **"새로 가져오기"** 클릭. 카테고리 라벨 색이 새 hex 로 보이는지 확인.

### 2-2. 우선 점검 글 (5건만)

각 카테고리당 한 글씩 골라서 재크롤:
```
노년       : keepioo.com 의 노년 카테고리 최신 글
문화       : 문화 카테고리 최신 글 (그라디언트 신규 등장)
학생·교육  : (색 약간 darker 변경)
주거       : (색 약간 darker 변경)
큐레이션   : (색 회색 → 슬레이트 큰 변화)
```

## 3. 네이버 블로그 썸네일

`/api/naver-thumbnail/{slug}` 가 네이버 블로그 발행 시 자동 첨부. 이미 발행된 글의 썸네일은 **그대로 옛 색 유지** (썸네일 PNG 가 네이버 서버에 저장됨).

### 3-1. 새 발행분만 자동 적용

5/17 이후 네이버 Chrome Extension 으로 발행되는 글부터 새 색 적용.

### 3-2. 옛 발행분 재발행 (선택)

옛 발행분 썸네일도 새 색으로 바꾸려면:
1. 어드민 → /admin/naver → 글 선택 → 재발행 클릭
2. 네이버 블로그에서 옛 글 삭제 후 새로 발행

**권장**: 신규 발행분만 적용하고 옛 발행분은 그대로 둠 (사용자가 새 발행만 봄).

## 4. 블로그 hero 그라디언트 (즉시 자동 반영)

`/blog/{slug}` 페이지의 hero 영역 (cover_image NULL 인 경우) 이 카테고리별 그라디언트로 채워짐. **CSS 그라디언트라 캐시 무관, 새로고침 즉시 새 색 노출**.

### 4-1. 점검 URL

```
keepioo.com/blog?category=학생·교육  → 새 teal 그라디언트
keepioo.com/blog?category=주거       → 새 emerald 그라디언트
keepioo.com/blog?category=큐레이션   → 새 슬레이트 그라디언트
keepioo.com/blog?category=문화       → amber 그라디언트 (신규, 이전엔 toss blue 였음)
```

### 4-2. AdSense 검수 영향

문화 카테고리 글이 이제 청년과 다른 시각 톤 → 카테고리 식별성 ↑ → AdSense 검수에서 "시각 다양성" positive signal.

## 5. AdSense 5/17 재신청 시 검토 포인트

`adsense-resubmission-2026-05-17.md` 가이드와 별개로 contrast fix 가 검수 점수에 영향:
- 8 영역 시각 사고 차단 → 카드 / 블로그 카드 가독성 ↑
- AdSense bot 크롤 시 OG image / 네이버 썸네일 / hero 그라디언트 모두 contrast 충족
- 카테고리별 시각 다양성 ↑ (문화 amber, 큐레이션 진한 슬레이트)

## 6. 롤백 절차 (시각 변경 마음에 안 들면)

특정 fix 가 시각적으로 안 맞으면 git revert 가능:

```bash
git revert 33d7733  # blog-cover 그라디언트만 (영향: 블로그 hero)
git revert 9cb8c18  # OG / 네이버 cleanup (영향: SNS / 네이버 썸네일)
git revert 75d6807  # white bg 위 brand text (영향: 인스타 카드 1·3)
git revert 10e8cf3  # 카드 1 pill 배지 (영향: 인스타 카드 1 만)
git revert 163e3a6  # 카테고리 bg 색 (영향: 학생·교육·주거 카드 2 배경)
```

각 commit 이 도메인 분리라 일부만 revert 해도 다른 fix 는 유지.

**SNS 캐시**: revert 후 OG debugger 재크롤 다시 필요.

## 7. 검수 결과 보고

5/17~5/19 사이 사장님이 직접 확인 후:
- 모두 만족 → "다음 도메인 작업 진행" 으로 클로드에게 요청
- 일부 어색 → 어색한 카테고리 + 어색한 영역 알려주면 클로드가 추가 조정
