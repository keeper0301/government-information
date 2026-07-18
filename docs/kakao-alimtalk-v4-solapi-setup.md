# 카카오 알림톡 V4 Solapi 설정 체크리스트

최종 목표: `POLICY_NEW_V4` 템플릿 승인 후 production에서 Pro 사용자 맞춤 정책 알림톡을 실제 발송한다.

## 1. 외부 콘솔 준비

- [ ] 카카오톡 채널 생성
- [ ] Solapi 가입 및 카카오 알림톡 사용 설정
- [ ] 발신 프로필 등록 후 `KAKAO_CHANNEL_PFID` 확보
- [ ] V4 템플릿 심사 신청
- [ ] 승인 후 Solapi 템플릿 ID 확보

## 2. V4 템플릿 등록값

- 템플릿 명칭: `정책알리미_신규정책알림_v4_운영자명시`
- 메시지 유형: 기본형
- 분류: 정보성
- 카테고리: 서비스이용 > 기타

### 본문

```text
[keepioo] 새 맞춤 정책 알림

#{user_name}님,
#{rule_name} 조건에 맞는 새 정책이 등록되었습니다.

▸ 정책명: #{title}
▸ 발표일: #{announced_at}
▸ 사장님 자격: #{eligibility_status}
▸ 지원 금액: #{benefit_summary}
▸ 신청 마감: #{deadline}

자세한 신청 조건과 절차는 아래에서 확인하실 수 있습니다.

※ 본 메시지는 고객님께서 keepioo 마이페이지에서 요청하신 맞춤 정책
알림 메시지로, 설정한 조건과 사장님 가게 정보에 해당하는 새로운 정책이
있을 경우 매번 발송되는 정보성 메시지입니다. 수신을 원하지 않으실 경우
마이페이지 > 알림 설정에서 언제든 해지 가능합니다.

문의: 키피오 / keeper0301@gmail.com
```

### 변수

```text
#{user_name}
#{rule_name}
#{title}
#{announced_at}
#{eligibility_status}
#{benefit_summary}
#{deadline}
#{detail_path}
```

### 버튼

1. 웹링크 · `자세히 보고 신청하기` · `https://www.keepioo.com#{detail_path}`
2. 웹링크 · `알림 설정 변경` · `https://www.keepioo.com/mypage/notifications`

## 3. Vercel Production 환경변수

필수 핵심값:

```text
KAKAO_ALIMTALK_PROVIDER=solapi
SOLAPI_API_KEY=...
SOLAPI_API_SECRET=...
KAKAO_CHANNEL_PFID=...
```

V4 템플릿 승인 후 추가:

```text
SOLAPI_TEMPLATE_ID_POLICY_NEW_V4=...
KAKAO_TEMPLATE_APPROVED_AT=YYYY-MM-DD
```

Fallback 템플릿이 이미 승인되어 있으면 아래 중 하나가 있어도 발송 가능하다.
단, 운영 추천은 V4다.

```text
SOLAPI_TEMPLATE_ID_POLICY_NEW_V3=...
SOLAPI_TEMPLATE_ID_POLICY_NEW=...
```

## 4. 승인 후 smoke

1. Vercel env 추가 후 production redeploy
2. `/admin/alimtalk` 접속
3. 환경변수 설정 상태에서 핵심값 + 템플릿 ID 확인
4. 테스트 발송 폼에서 `POLICY_NEW_V4` 선택
5. 본인 휴대폰 번호로 테스트 발송
6. 카카오톡 수신 확인
7. 실패 시 `/admin/alimtalk` 실패 원인, Solapi 콘솔 잔액/템플릿/PFID 확인

## 5. 운영 주의

- V4 승인 전에는 V3/V2 fallback을 삭제하지 않는다.
- 할인, 이벤트, 프로모션, 친구 추가 유도 등 광고성 표현을 넣지 않는다.
- `detail_path`는 `/welfare/{id}` 또는 `/loan/{id}`처럼 선행 `/`가 있는 내부 경로만 사용한다.
- 테스트 발송은 `admin_actions`에 마스킹 번호와 템플릿 코드만 기록하고, `alert_deliveries`에는 기록하지 않는다.
