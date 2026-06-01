import { randomUUID } from "node:crypto";

const MAX_BODY_BYTES = 256 * 1024;

export function readOuterGatewayConfig(env = process.env) {
  const useCronSecret = env.OUTER_USE_CRON_SECRET === "true";
  const authToken = env.OUTER_AUTH_TOKEN || (useCronSecret ? env.CRON_SECRET || "" : "");
  const upstreamBaseUrl = trimTrailingSlash(env.OUTER_UPSTREAM_BASE_URL || "");
  const upstreamAuthToken = env.OUTER_UPSTREAM_AUTH_TOKEN || env.OPENAI_API_KEY || "";

  return {
    enabled: env.OUTER_GATEWAY_ENABLED !== "false",
    authToken,
    mode: upstreamBaseUrl && upstreamAuthToken ? "proxy" : "rules",
    upstreamBaseUrl,
    upstreamAuthToken,
    upstreamModel: env.OUTER_UPSTREAM_MODEL || env.OUTER_MODEL || "gpt-5.2",
  };
}

export async function handleOuterResponsesRequest({
  req,
  res,
  config,
  fetchImpl = fetch,
}) {
  if (!config.enabled) {
    writeJson(res, 404, { error: { message: "아우터 서버가 꺼져 있습니다." } });
    return;
  }

  if (!isAuthorized(req, config.authToken)) {
    writeJson(res, 401, { error: { message: "아우터 인증에 실패했습니다." } });
    return;
  }

  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    writeJson(res, bodyResult.status, { error: { message: bodyResult.error } });
    return;
  }

  if (config.mode === "proxy") {
    await proxyResponsesRequest({
      res,
      config,
      body: bodyResult.body,
      fetchImpl,
    });
    return;
  }

  const decision = buildRulesDecision(bodyResult.body);
  writeJson(res, 200, buildResponseEnvelope(decision));
}

function isAuthorized(req, token) {
  if (!token) return false;
  const header = req.headers.authorization || "";
  return header === `Bearer ${token}`;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: "요청 본문이 너무 큽니다." };
    }
    chunks.push(chunk);
  }

  try {
    const raw = Buffer.concat(chunks).toString("utf8");
    return { ok: true, body: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false, status: 400, error: "요청 본문 JSON을 읽지 못했습니다." };
  }
}

async function proxyResponsesRequest({ res, config, body, fetchImpl }) {
  const upstreamBody = {
    ...body,
    model: body.model || config.upstreamModel,
  };

  const upstreamResponse = await fetchImpl(`${config.upstreamBaseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.upstreamAuthToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(upstreamBody),
  });

  const text = await upstreamResponse.text();
  res.writeHead(upstreamResponse.status, {
    "content-type": upstreamResponse.headers.get("content-type") || "application/json",
  });
  res.end(text);
}

function buildRulesDecision(body) {
  const payload = extractManagerPayload(body);
  const siteOk = payload?.site?.ok !== false;
  const cycleOk = payload?.cycle?.ok !== false;

  if (!siteOk) {
    return {
      severity: "urgent",
      summary: "주요 공개 페이지 장애가 감지되었습니다.",
      actions: [
        "사이트 상태 점검 결과를 확인합니다.",
        "배포 서비스와 데이터베이스 연결 상태를 확인합니다.",
        "장애가 계속되면 관리자에게 알림을 보냅니다.",
      ],
      auto_execute_allowed: false,
    };
  }

  if (!cycleOk) {
    return {
      severity: "watch",
      summary: "상주 관리 작업 중 일부가 실패했습니다.",
      actions: [
        "실패한 크론 작업을 다시 실행합니다.",
        "반복 실패가 있으면 원인 로그를 확인합니다.",
      ],
      auto_execute_allowed: false,
    };
  }

  return {
    severity: "normal",
    summary: "사이트와 상주 관리 작업이 정상 범위입니다.",
    actions: ["현재 자동 관리 상태를 유지합니다."],
    auto_execute_allowed: false,
  };
}

function extractManagerPayload(body) {
  if (!Array.isArray(body?.input)) return null;

  const userMessage = body.input.find((item) => item?.role === "user");
  if (typeof userMessage?.content !== "string") return null;

  try {
    return JSON.parse(userMessage.content);
  } catch {
    return null;
  }
}

function buildResponseEnvelope(decision) {
  const outputText = JSON.stringify(decision);
  return {
    id: `outer_rules_${randomUUID()}`,
    object: "response",
    output_text: outputText,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: outputText }],
      },
    ],
  };
}

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
