# 운영 SMS 발신번호 만료 점검

## 적용 전 확인 원칙

만료 알림의 마스킹된 번호만으로 운영 발신번호 일치를 단정하지 않는다. 만료시각에 시간대가 없으면 KST/UTC로 임의 변환하지 않는다. 프로젝트 설정 존재만으로 현재 배포의 설정 적용이나 최근 채널 전달 성공을 증명하지 않는다. 실제 설정값과 계정 정보는 비공개 경로에서만 대조하고 공개 문서·PR·로그에 남기지 않는다.

## 안전한 일치 확인 경로

1. Solapi 콘솔에서 만료 알림의 계정과 운영 API key가 속한 계정/워크스페이스를 확인한다. API key/secret 원문을 메일·PR·로그에 붙이지 않는다.
2. 해당 계정의 발신번호 관리 화면에서 만료 예정 번호 전체, 등록/인증 상태, 만료시각을 확인한다. 메일의 마스킹된 앞뒤 숫자 일치는 후보 확인일 뿐이다.
3. 운영 도메인에 연결된 Production 배포를 확인한다. 프로젝트의 최신 설정과 배포 당시 설정이 다를 수 있다. 권한 있는 운영자가 배포에 사용된 `SOLAPI_OPS_FROM_PHONE`과 콘솔의 전체 번호를 비공개 화면/보안 런타임 안에서 숫자만 남겨 대조한다. 외부 기록에는 `match=true/false`, 설정 존재 여부, SMS disable 여부, 배포 ID, 확인시각만 남긴다. 전체 번호나 단순 해시를 공개하지 않는다.
4. Vercel 감사/함수 로그에서 최근 `health_alert_run`의 `smsOk/smsReason/telegramOk`를 확인한다. `skipped_disabled`는 정책상 미발송이며 번호 만료 오류가 아니다. cooldown으로 발송이 생략된 실행은 채널 검증으로 사용하지 않는다.
5. 번호가 다르면 이 메일을 운영 SMS 장애로 단정하지 않는다. 일치하면 같은 계정의 등록을 갱신한다. SMS가 꺼져 있어도 향후 재사용 대비 갱신할 수 있으나 자동으로 SMS를 켜지는 않는다.

## 갱신 및 확인 항목

- [ ] Solapi의 발신번호 확인/ARS 및 명의 확인 절차를 끝내고 최종 등록 상태와 새 만료일을 확인한다. 단순 ARS 완료만으로 갱신 완료를 판단하지 않는다.
- [ ] 만료시각 시간대는 콘솔 표시 또는 고객지원으로 확인한다. 확인 전에는 만료 직전까지 미루지 말고 만료일보다 충분히 앞서 갱신한다.
- [ ] 동일 번호 갱신만 했다면 앱 환경변수를 바꿀 필요가 없다. 번호/설정 변경 시 새 Production 배포에 적용됐는지 재확인한다.
- [ ] SMS를 재사용하기로 결정한 경우에만 승인된 테스트 수신번호로 1건 발송한다. 전체 운영 cron 재실행은 알림/감사/cooldown 부작용이 있어 피한다. 현재 비활성 정책을 유지하는 경우 실제 SMS 검증은 보류한다.
- [ ] 발송 응답의 messageId/groupId를 기록하고 Solapi 발송내역의 해당 건 상태와 실제 휴대폰 수신을 대조한다. HTTP 200/접수 성공만으로 도착 완료라 하지 않는다. 공식 상태 `2000`=접수, `3000`=이통사 접수·결과 리포트 대기, `4000`=수신 완료다.
- [ ] Telegram은 설정된 owner 합집합에 대한 `ok/sent/failed`와 실제 수신을 확인한다. `ok=true`는 적어도 한 owner 성공이므로 모든 owner 성공을 별도로 확인한다.
- [ ] 만료/거절은 실번호를 무효화하지 않고 mock으로 검증한다: `sms.ok=false`, `reason=api_error`, 구체 코드/메시지 보존, `telegram.ok=true`, `anyDelivered=true`.
- [ ] SMS network 오류 + Telegram 성공, 양 채널 실패, SMS 비활성 + Telegram 성공도 회귀 테스트로 확인한다.
- [ ] health audit의 `smsError`와 external-console audit의 `sms_error`를 확인한다. 반환값을 무시하는 호출자도 `[ops-alert] SMS failed` 함수 로그에 원인이 남는다. 로그에는 번호/API credentials를 가린다.

## 코드의 처리 범위

한 채널이라도 성공하면 `anyDelivered=true`는 그대로 유지한다. Solapi non-2xx/명시적 errorCode/거절 statusCode는 `api_error`로 반환하고 코드·설명을 남긴다. 성공 HTTP에서 ID 없는 응답도 실패로 판정한다. 특정 만료 전용 코드나 만료 발생 사실은 추정하지 않는다. API 접수 이후 비동기 통신사 거절은 이 helper가 조회하지 않으므로 Solapi 발송내역으로 별도 확인한다.

테스트는 `__tests__/lib/notifications/ops-alert-sms-fallback.test.ts`이며 모든 외부 fetch를 mock 처리한다. 실제 운영 SMS를 켜거나 번호를 변경하지 않는다.

## 공식 자료

- 발신번호/갱신: https://solapi.com/guides/senderid
- 갱신 FAQ: https://solapi.com/guides/senderid-faq
- 메시지 상태: https://solapi.com/message-status-codes
