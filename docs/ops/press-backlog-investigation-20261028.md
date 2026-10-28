# 정책 후보 적체 및 자동 운영 차단 검증

확인일: 2026-10-28 KST. 기준 master: `7ee73f91a79c42d5147e432570ba4d4842e7a48f`.
운영 DB는 SELECT만 실행했다. 승인 기준·결제·키·후보 상태·예약 실행은 변경하지 않았다.

## 확인된 경로와 원인

| 단계 | 운영 증거 | 판정 |
| --- | --- | --- |
| 유입 | 최근 7일 지역 수집 audit 1,911건, 실행 audit 42건 | 전체 수집 중단 아님. 도시별 장애는 별도 존재 |
| 뉴스 모더레이션 | 최근 7일 56회, classified=0, failed 합계 11,200 | 동일 글 재시도가 포함된 실패 시도 수. 고유 실패 글 수 아님 |
| 정책 L2 분류 | 최근 7일 21회, classified=0, errors 합계 581, 기존 후보 skip 합계 385 | cron 진입은 계속되나 분류는 중단됨 |
| L2 실패 저장 | 최근 7일 failed 후보 581건에 OpenAI 429 insufficient_quota / credit_balance_exhausted | 결제 잔액 소진 확정. 581건은 pending 114건에 포함되지 않음 |
| 검토·확정 | pending 114건: mid 78 / high 18 / low 18. 모두 application_source_unverified | 원문에서 신청 주소 근거를 확인하지 못해 안전 보류. 자동 재선택에서 제외되는 현재 설계 유지 |
| low 결정 | 알림 시각까지 7일 실제 rejected_at 기준 9건, confirmed_at 기준 0건 | 9건 모두 기존 14일 정리 cron. 사람 확정·거절은 각각 0건 |

DB 조회 시각 2026-10-28 00:24~00:25 KST의 뉴스 미분류는 7,263건이었다.
이는 10월 27일 알림의 6,012건과 시점이 다르다. 이후 유입이 지속됐으며 최신값으로 고정해서 해석하지 않는다.
low 비교 창은 원본 메일 발송 시각 `2026-10-27T00:15:31Z` 직전 7일로 고정했다.

현재 통계는 후보 생성일(created_at)을 기준으로 잘라 오래된 후보의 최근 결정을 누락한다.
9건의 자동 정리는 10월 22일 1건, 25일 6건, 27일 2건(KST)이다. 마지막 2건이
116→114 감소와 일치한다. 이를 사람 검수 실적이나 LLM 정확도로 해석하면 안 된다.

news 모더레이션도 같은 LLM 도구를 쓴다. GHA run `40457570469`, job `122034366048`의
06:09 UTC 응답에 classified=0 / failed=200 및 "You have no credits remaining"이 있다.
`cronFailures24h`는 cron_failure_log.notified_at 집계다. 부분 오류를 결과에 누적하고
HTTP 200을 반환하는 분류 경로의 성공 여부를 보장하지 않는다.

## #428의 실제 의미

GHA run `40451942527`, job `122016458397`의 2026-10-27 04:50:34 UTC 원본 응답 확인:

- 차단 제안: 네이버 블로그 큐 1,780건, 24시간 발행 0건 복구 안내.
- 안내문 `popup secret 입력`의 `secret`을 learning-loop의 laneFor가 감지해 blocked로 분류했다.
- 이슈의 area=policy는 **자동화 권한 정책 분류**이며 정책뉴스 등록 제안이라는 뜻이 아니다.
- 실제 실행 요청이 차단됐다는 기록도 아니다. 이슈는 학습 후보의 분류를 경고한다.
- 최근 7일 해당 창의 agent_execute_run 1,520건은 auto_execute 760 / create_pr 760이며
  모두 dispatched=false였다. 이것은 조회한 실행 감사 범위의 증거이지 감사 밖 실행까지 보장하지 않는다.
- health score=0이어도 진단 906회/목표 288회로 heartbeat는 healthy였다. high 후보 12개에
  각 8점, blocked 1개 6점, 이상 신호 26점을 감점해 0으로 잘린 결과다.
- 12개는 최근 스캔을 area:title:evidence로 묶은 최대 12개 표시 결과다. 대기 수치가 달라진
  동일 품질/채널 문제가 여러 번 포함돼 있으며 독립적인 미해결 결함 12개라는 뜻이 아니다.

기존 keyword 차단, 실제 decideAgentAutomation, 실행 경로의 403/dispatched=false,
W2 미활성·미등록 dispatcher 차단은 유지한다.

## 이번 최소 수정

1. press-ingest: 확인된 잔액·한도·인증·권한 공통 장애에서 즉시 중단하고 안전한 사유를 기록한다.
   서비스 장애를 개별 후보의 영구 failed 행으로 저장하지 않는다. 이전 failed 행은 변경하지 않는다.
2. news-classify: 이미 시작한 최대 5개 병렬 요청이 끝나면 다음 배치를 중단한다.
   성공한 건수와 미처리 뉴스 상태를 보존하며 감사 기록에 stop_reason을 남긴다.
3. 두 경로는 처리 오류를 ok=false로 반환한다. 자동 HTTP 재시도로 추가 처리가 발생하지 않도록
   처리 결과 응답 HTTP 200은 유지한다. HTTP 코드만 보는 외부 감시는 여전히 별도 보완 대상이다.
4. health/통계 카드의 low 결정은 confirmed_at/rejected_at으로 집계한다. 자동 결정도 포함하는
   비율에서 LLM 정확도나 기준 완화를 추천하던 힌트를 보수적인 확인 안내로 대체한다.
5. 같은 학습 제안을 합칠 때 심각도 상승과 blocked를 보존한다. 실제 실행 정책이 blocked인
   감사 기록은 action 문자열에 차단 키워드가 없어도 blocked로 유지한다.

기존 #427의 뉴스 작성 중단 로직과 오류 분류 함수를 재사용한다. #427을 다시 구현하지 않는다.

## 완료된 개선과 남은 조치

- #427: 병합 완료. editorial news 작성 경로의 반복 중단이며 L2/모더레이션을 고치지 않았다.
- 신청 원문 근거 가드: 이미 구현돼 있으며 114건 보류의 직접 원인. 우회하지 않는다.
- 제주: 최근 2회 audit fetched=0/inserted=0 확인. 기존 열린 #404가 있어 중복 수정하지 않는다.
- 분류 잔액 복구 후 정상 예약 실행에서 실제 classified 증가·stop_reason 해소를 확인해야 한다.
  결제 설정/인증 값 변경이나 유료 API 시험 호출은 이번 작업에서 하지 않았다.
- 기존 failed 581건은 UNIQUE news_id 및 최근 24시간 조회 창 때문에 잔액 복구만으로 자동 재처리되지
  않는다. 원문·기한·기존 등록 중복을 확인한 선별 복구가 필요하다. 전체 삭제/재실행 금지.
- 보류 114건은 원문 신청 링크 또는 공식 안내를 개별 확인해 검수한다. 근거 없는 자동승인 금지.
- press-confidence-tune의 측정은 기존 updated_at 및 자동/수동 혼합 집계다. 이번 PR은 그 자동 기준이나
  설정을 변경하지 않는다. 사람 검수 표본과 분리 검증하기 전에는 이 통계로 기준 완화하지 않는다.
- DB 로그에는 statement timeout도 있었으나 해당 실패와의 연결 근거는 없어 잔액 장애와 혼동하지 않는다.

## 검증

- 수정 전 통계 누락, 반복 분류 실패, 학습 후보 차단 유실을 실패 테스트로 재현.
- 최종 관련 테스트: 15개 파일 187개 통과.
- 자료형 검사 및 변경 파일 ESLint 통과.
- 전체 npm test: 592개 파일 통과 / 1개 실패 / 4개 건너뜀,
  테스트 4,059개 통과 / 1개 실패 / 17개 건너뜀.
- 실패: `__tests__/lib/scraping/local-press/cheorwon-progress.test.ts`
  `EINVAL: invalid argument, chown '/tmp/fonts'`. 이번 변경과 무관한 파일이지만 전체 통과로 표시하지 않는다.
- 운영 배포와 복구 후 실제 정상 실행은 미검증.

## 출처

- 운영 알림: https://mail.google.com/mail/#all/1a17ab6585674c99
- 이슈: https://github.com/keeper0301/government-information/issues/428
- 병합 개선: https://github.com/keeper0301/government-information/pull/427
- 기존 제주 개선: https://github.com/keeper0301/government-information/pull/404
- 차단 원본 로그: https://github.com/keeper0301/government-information/actions/runs/40451942527
- 분류 잔액 오류 로그: https://github.com/keeper0301/government-information/actions/runs/40457570469
- 운영 DB: press_ingest_candidates, admin_actions, news_posts 읽기 전용 집계.

## 10월 28일 후속 점검

- 이전 PR head `9e8122371137d7b86e2a4e22508496c18ccfee61`의 GitHub CI run
  `40532780933` 성공 확인. 당시 PR은 초안·미병합이고 제출된 리뷰는 없었다.
- 로컬 철원 테스트는 Chromium launch만 모의 처리하면서 서버용 바이너리 압축 해제는
  실제 실행해 `/tmp/fonts` chown에서 실패했다. 테스트에서 `@sparticuz/chromium`도
  모의 처리해 외부 바이너리·파일 권한에 의존하지 않게 했다. 수집 제품 코드는 변경하지 않았다.
  잘못된 첨부 오류 보존과 다음 정상 글 저장 검증은 그대로 유지한다.
- 2026-10-28 17:04 KST 읽기 전용 조회: pending 114건 유지, 최신 정책 분류 실행 성공 0건.
  같은 날 새 failed 후보 100건에서 credit_balance_exhausted 확인(마지막 생성 15:31 KST).
  결제 잔액 문제는 아직 복구되지 않았으며 새 PR 코드도 운영에 반영되지 않았다.
- 보류 114건 전부 application_source_unverified 유지. 추출된 신청 마감일이 지난 후보 1건이
  있으나 원문 대조 전에는 확정 판정하지 않고, 승인·거절·삭제는 실행하지 않았다.
- 후속 전체 검사: 593개 파일·4,062개 테스트 통과, 실패 0, 17개 테스트 건너뜀.
  자료형 검사·변경 테스트 ESLint·diff check도 통과했다. 앞 절의 최초 환경 오류는 해소됐다.
