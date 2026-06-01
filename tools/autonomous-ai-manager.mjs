const DEFAULT_MODEL = "gpt-5.2";
const DEFAULT_MANAGER_INTERVAL_MS = 30 * 60 * 1000;
const PERMISSION_LEVELS = new Set(["observe", "expanded", "full_safe"]);

export function readAiManagerConfig(env = process.env) {
  const useCronSecret = env.OUTER_USE_CRON_SECRET === "true";
  return {
    enabled: env.AI_MANAGER_ENABLED === "true",
    authToken:
      env.OUTER_AUTH_TOKEN || (useCronSecret ? env.CRON_SECRET || "" : ""),
    baseUrl: trimTrailingSlash(env.OUTER_BASE_URL || ""),
    model: env.OUTER_MODEL || DEFAULT_MODEL,
    permissionLevel: normalizePermissionLevel(env.AI_MANAGER_PERMISSION_LEVEL),
    intervalMs: Math.max(
      5 * 60 * 1000,
      Number(env.AI_MANAGER_INTERVAL_MS || DEFAULT_MANAGER_INTERVAL_MS),
    ),
  };
}

export function shouldRunAiManager({
  nowMs,
  lastRunAt,
  site,
  intervalMs,
}) {
  if (!site?.ok) return true;
  if (!lastRunAt) return true;
  return nowMs - Date.parse(lastRunAt) >= intervalMs;
}

export async function runAiManager({
  config,
  site,
  cycle,
  fetchImpl = fetch,
}) {
  if (!config.enabled) {
    return { ok: false, skipped: true, reason: "disabled" };
  }
  if (!config.authToken) {
    return { ok: false, skipped: true, reason: "missing_outer_auth_token" };
  }
  if (!config.baseUrl) {
    return { ok: false, skipped: true, reason: "missing_outer_base_url" };
  }

  const response = await fetchImpl(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: buildManagerPrompt({ config, site, cycle }),
    }),
  });

  const body = await response.json().catch(async () => ({
    error: await response.text().catch(() => ""),
  }));

  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      reason: "openai_api_error",
      status: response.status,
      error: JSON.stringify(body).slice(0, 1000),
    };
  }

  const outputText = extractOutputText(body);
  const decision = parseDecision(outputText);
  return {
    ok: true,
    skipped: false,
    responseId: typeof body.id === "string" ? body.id : null,
    outputText,
    decision,
  };
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function buildManagerAlert(result) {
  if (!result.ok || !result.decision) return null;
  const decision = result.decision;
  if (decision.severity === "normal") return null;

  return {
    subject: `[keepioo AI 상주 관리자] ${decision.severity}`,
    message: [
      decision.summary,
      "",
      "권장 조치:",
      ...decision.actions.map((action, index) => `${index + 1}. ${action}`),
      "",
      `자동 실행 허용: ${decision.auto_execute_allowed ? "예" : "아니요"}`,
    ].join("\n"),
  };
}

function buildManagerPrompt({ config, site, cycle }) {
  return [
    {
      role: "system",
      content: [
        "너는 keepioo 사이트의 상주 운영 관리자다.",
        "한국어로만 판단한다.",
        "삭제, 결제, 권한, 비밀값, 데이터베이스 파괴 작업은 절대 자동 실행하지 않는다.",
        "허용된 자동화 수준 안에서 가능한 한 적극적으로 운영한다.",
        "운영자가 바로 볼 수 있게 JSON 하나만 반환한다.",
        "형식: {\"severity\":\"normal|watch|urgent\",\"summary\":\"...\",\"actions\":[\"...\"],\"auto_execute_allowed\":false}",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        site,
        cycle,
        permission_level: config.permissionLevel,
        allowed_auto_actions: allowedActionsForLevel(config.permissionLevel),
        blocked_auto_actions: [
          "삭제",
          "결제/환불",
          "권한 변경",
          "비밀값 변경",
          "운영 데이터베이스 파괴 작업",
          "품질 검수 없는 외부 발행",
        ],
      }),
    },
  ];
}

function extractOutputText(body) {
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return "";

  const parts = [];
  for (const item of body.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function parseDecision(text) {
  const parsed = safeJson(text);
  if (!parsed || typeof parsed !== "object") return null;

  const severity = normalizeSeverity(parsed.severity);
  const summary =
    typeof parsed.summary === "string"
      ? parsed.summary.slice(0, 500)
      : "AI 상주 관리자 판단 요약이 없습니다.";
  const actions = Array.isArray(parsed.actions)
    ? parsed.actions
        .filter((action) => typeof action === "string")
        .slice(0, 5)
    : [];

  return {
    severity,
    summary,
    actions,
    auto_execute_allowed: parsed.auto_execute_allowed === true,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeSeverity(value) {
  if (value === "urgent" || value === "watch" || value === "normal") {
    return value;
  }
  return "watch";
}

function normalizePermissionLevel(value) {
  return PERMISSION_LEVELS.has(value) ? value : "expanded";
}

function allowedActionsForLevel(level) {
  const base = [
    "사이트 상태 확인",
    "운영 진단 기록",
    "관리자 알림",
  ];
  if (level === "observe") return base;

  const expanded = [
    ...base,
    "안전한 cron 재시도 제안",
    "IndexNow 제출 제안",
    "블로그 품질 점검",
    "외부 콘솔 이상 감지",
  ];
  if (level === "expanded") return expanded;

  return [
    ...expanded,
    "등록된 저위험 dispatcher 자동 실행",
    "검증된 비파괴 백필 제안",
    "스크래퍼 수정 PR 생성 제안",
    "알림 문구 개선 PR 생성 제안",
  ];
}
