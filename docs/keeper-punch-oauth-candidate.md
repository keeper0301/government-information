# keeper.punch isolated OAuth candidate

**Not deployed, no live credentials read, no real provider/DB requests made.** Base: `38160f0c08b1fea35c3b3b0dc65d54a02fea1513`.

## Routes and boundaries

- `POST /api/threads/keeper-punch/oauth/start`: header `x-keeper-punch-control`, no query credential/cookies. Returns private intent/authorization URL. No body is needed.
- Registered callback stays exactly `https://www.keepioo.com/api/threads/oauth/callback`. Only state starting `keeper-punch-v1.` takes the new isolated early branch; original callback code remains otherwise byte-for-byte unchanged.
- `POST /api/threads/keeper-punch/oauth/handoff`: same dedicated header, JSON `{ "nonce": "64 hex chars" }`. Only exact bound verified/unexpired credentials are returned. Repeated reads are allowed so a local persistence crash is recoverable. No remote consume operation.
- All isolated responses have private/no-store, no-referrer and fixed error messages. Provider responses are streamed with a 32 KiB hard cap, private handoff input capped at 1 KiB, no redirects, 15 second provider timeout. Nothing logs codes, tokens, provider bodies or URLs.
- Dedicated configuration only: `KEEPER_PUNCH_THREADS_APP_ID`, `KEEPER_PUNCH_THREADS_APP_SECRET`, `KEEPER_PUNCH_THREADS_USER_ID`, `KEEPER_PUNCH_OAUTH_CONTROL_SECRET`. No fallback to shared app/account/control env values.
- Expected username is exactly `keeper.punch`. Requested/granted scopes: `threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies` (no insights).
- Signed state binds random 256-bit nonce, app/account/username, exact callback and issue time, expires strictly after 10 minutes. DB intent is written before returning authorization URL.
- One conditional update CAS `prepared -> exchanging` precedes any provider exchange. Provider rejection, malformed results, network failure or ambiguous persistence after entering exchange is terminal `unknown` (or terminal `exchanging` if DB marking fails); callback replay never re-exchanges.
- Code exchange and long token conversion use only dedicated app values. `/debug_token` must independently confirm `app_id`, `user_id`, `is_valid`; `/me` confirms exact id/username and `/me/permissions` proves actual granted statuses. Claimed/stored scope strings alone do not suffice.

## Storage encryption

Only bucket `keeper-punch-oauth-v1` is touched. Entire verified credential is AES-256-GCM encrypted with fresh 96-bit IV, 128-bit tag, SHA-256 key derivation domain label `keeper-punch-oauth-v1/credential/aes-256-gcm\\0` plus dedicated control secret. AAD binds bucket, app, account, username, callback and nonce. Rows contain only encrypted envelope and nonsecret binding/status/expiry metadata; no raw access token. Handoff authenticates/decrypts then rechecks bindings, nonce, scopes and actual expiry. Changing control secret invalidates in-flight states and stored envelopes. No migration/consumer/shared-bucket modification.

## Private Python helper

Artifact: `../candidate-helper/keeper_oauth.py` (stdlib, no package installs). Parent-provided private config schema is used **without reading that real file during development**:

```json
{"site":"https://www.keepioo.com","canonical_env":"/home/user/.hermes/workspace/claude/config/keepioo-publisher.env","control_secret":"<private>","expected_user_id":"<id>","expected_username":"keeper.punch","app_id":"<app>"}
```

Parent-only commands after reviewed deployment (not executed here):

```sh
python3 candidate-helper/keeper_oauth.py prepare --config /private/operator.json --intent /private/intent.json
python3 candidate-helper/keeper_oauth.py status --config /private/operator.json --intent /private/intent.json
python3 candidate-helper/keeper_oauth.py handoff --config /private/operator.json --intent /private/intent.json
```

Config/intent/env must be regular owner-only files, not symlinks (including parent symlinks); private `flock` lock files are used. Prepare checks existing canonical app/account first and stores the private authorization URL/state without printing either. stdout is only fixed status labels. Private handoff payload is never printed. No token/control secret arguments are accepted.

Before persistence: original canonical `THREADS_APP_ID` must match config and every present `THREADS_ACCOUNT_ID`/`THREADS_USER_ID` must match expected ID (at least one required); nonce/app/id/username/scopes/expiry are checked, then **two independent `/me` requests and one `/me/permissions` request** prove identity/grants with returned token. Only then is an exclusive 0600 backup made and a scoped update atomically renamed into the canonical path with fsync and SHA-256 source CAS. Only `THREADS_ACCESS_TOKEN`, `THREADS_TOKEN_EXPIRES_AT`, `THREADS_SCOPES` are updated; unrelated lines remain unchanged. Temporary test config can select a temporary canonical path. No permit changes, workers, timers, publication or app/account ID changes.

## Local proof / limits

Logs and focused TypeScript configuration are in the parent report directory. `web-red.log` and `helper-red.log` show missing implementation failures; `web-green-slice1.log` shows first slice green; `web-encryption-red.log` shows encryption regression red; final complete focused run is `web-final.log`, `helper-final.log`, `typecheck.log`. Dependencies are reused via an untracked node_modules symlink to `/home/user/government-information/node_modules`; no install/network. `tsc` CLI was blocked by lifecycle scanner file-size cap; equivalent TypeScript compiler API `createProgram` + `getPreEmitDiagnostics` completed with zero diagnostics using `../tsconfig.keeper.json`.

**Activation blockers / unverified external claims:**

1. Repository contains no discoverable `sidecar_state` SQL/schema migration. No `id` field is assumed or used. Adapter uses existing `bucket`/`payload` interface and PostgREST JSON filters, but actual schema, service-role update grants, RLS, JSON payload support and PostgreSQL concurrency must be checked by parent in a separate authorized canary before production activation. Mocked adapter tests do NOT prove live DB behavior.
2. Real Meta app/account/grants, registered redirect URI, app debug token authorization, bearer header support and provider response formats were not queried. The candidate fails closed if any differ. Long-token endpoint and debug input token necessarily appear in provider request query strings; code never logs them, but deployment/APM/proxy request URL capture must be disabled/redacted by parent. Registered callback URLs also carry the authorization code: platform access logging must be reviewed.
3. No real OAuth, deployment, full production build, full repository suite or live canonical persistence occurred. Canonical/helper config paths and secret files were not opened. Existing action worker remains untouched/stopped; no auto-resume logic exists.
4. File locking is cooperative plus digest CAS; hostile same-UID writers ignoring locks can race filesystem operations. Keep config/env parent directories under trusted owner control. No remote token revocation/cleanup or automatic exchange retry is implemented.
