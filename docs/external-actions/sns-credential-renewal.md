# SNS credential 재발급 / Vercel env 등록 가이드

자동 개선 스캔의 `SNS 채널 발행 실패가 누적됐습니다` 알림을 처리하는 절차입니다.

> 금지: token, secret, OAuth code, access token 값을 채팅·문서·commit에 붙여넣지 않습니다. 값은 Vercel dashboard 또는 `vercel env add` 입력 프롬프트에만 넣습니다.

## 0. 현재 상태 확인

1. GitHub Actions → **Manual Site Cron Trigger** → `sns-credential-check` 실행
2. 결과에서 채널별 상태만 확인합니다.
   - `missing_credentials`: env 이름이 누락됨
   - `invalid_token_code_190_failed_to_decrypt`: Threads/Meta token 재발급 필요
   - `permission_*`: 앱 권한·Page 권한·Threads API access 확인 필요
   - `http_500`: Meta 쪽 일시 오류 또는 token/app 상태 불안정. 재실행 후 반복되면 재발급

## 1. X/Twitter

필요 env 4개:

- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_TOKEN_SECRET`

절차:

1. https://developer.x.com/en/portal/dashboard 접속
2. keepioo 발행용 App 선택
3. User authentication settings에서 **Read and Write** 권한 확인
4. Keys and tokens에서 API Key/Secret, Access Token/Secret 재발급
5. Vercel project `government-information` → Settings → Environment Variables
6. 위 4개를 **Production** 환경에 등록/갱신
7. Production redeploy 또는 다음 배포 후 `sns-credential-check` 재실행

## 2. Facebook Page

필요 env 2개:

- `FACEBOOK_PAGE_ID`
- `FACEBOOK_PAGE_ACCESS_TOKEN`

절차:

1. https://developers.facebook.com/apps/ 접속
2. keepioo Meta App 선택
3. Page publishing 권한이 있는 사용자로 Page Access Token 발급
4. 가능하면 long-lived token으로 교환
5. Vercel Production env에 `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` 등록/갱신
6. `sns-credential-check` 재실행

## 3. Threads

필요 env 2개:

- `THREADS_USER_ID`
- `THREADS_ACCESS_TOKEN`

절차:

1. Meta for Developers에서 Threads API access가 활성화된 앱 확인
2. Threads 계정과 연결된 user id 확인
3. access token 재발급
4. Vercel Production env에 `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` 등록/갱신
5. `sns-credential-check` 재실행

### Threads `code 190 · Failed to decrypt`

이 메시지는 token이 손상·폐기·앱 불일치·암호화 상태 문제로 Graph API가 해석하지 못할 때 발생합니다.

처리:

1. 기존 token 값을 재사용하지 말고 새 token 발급
2. token을 발급한 Meta App과 Threads API 호출 앱이 같은지 확인
3. 필요한 scope/API access가 승인됐는지 확인
4. 새 값을 Vercel Production env에만 넣고, 채팅/문서에는 남기지 않음
5. `sns-credential-check`가 `ok:true`가 될 때까지 반복

## 4. 갱신 후 검증

1. `sns-credential-check` 실행
2. 결과가 모두 `ok:true`인지 확인
3. 필요하면 `sns-publish-blog` 또는 `sns-publish-popular-policy`는 별도 승인 후 실행
4. `/admin/autonomous`의 SNS 카드에서 top fail reason이 줄었는지 확인
5. `autonomous-improvement-scan` 재실행으로 HIGH 알림이 사라지는지 확인

## 5. 안전선

- 외부 SNS 발행 cron은 credential 확인과 별개입니다. credential 갱신 후 발행 cron 실행은 별도 판단합니다.
- Vercel env 값은 출력하지 않습니다.
- GitHub Actions log에 secret 값이 나오지 않게 값 자체를 echo하지 않습니다.
