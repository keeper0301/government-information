// ============================================================
// 텔레그램 어드민 명령 — /env (list / set), /redeploy.
// ============================================================
// Vercel API 로 운영 toggle env 변경 + production 재배포. 사장님 모바일에서
// "임계값 조정 → 즉시 반영" 1분 워크플로우 구현 (Phase 3).
//
// 보안 — env 변경 화이트리스트 강제. 임의 KEY 입력 시 거부 (예: 봇이 실수로
// SUPABASE_SERVICE_ROLE_KEY 같은 critical secret 을 변경하지 못하게).
// 화이트리스트는 운영 toggle 만: 임계·tier 같은 일상 조정 대상.
// ============================================================

import {
  listProjectEnvs,
  updateProjectEnvByKey,
  triggerProductionRedeploy,
} from "@/lib/vercel/api";

// 변경 가능한 env 화이트리스트 — 각 항목은 (1) 설명 + (2) 값 검증 함수.
// 추가 toggle 필요 시 여기 한 줄 추가하면 끝.
interface EnvSpec {
  description: string;
  // 유효한 값이면 null, 아니면 사용자 친화 에러 메시지 반환.
  validate: (value: string) => string | null;
}

const ENV_WHITELIST: Record<string, EnvSpec> = {
  DEDUPE_AUTO_CONFIRM_THRESHOLD: {
    description: "dedupe 자동 confirm 임계값 (0.5~1.0)",
    validate: (v) => {
      const n = parseFloat(v);
      if (Number.isNaN(n) || n < 0.5 || n > 1.0) {
        return "0.5 이상 1.0 이하 숫자만 허용 (예: 0.88)";
      }
      return null;
    },
  },
  PRESS_LOW_TIER_FLOOR: {
    description: "보도자료 low tier 큐 임계 (high|mid|low)",
    validate: (v) => {
      if (!["high", "mid", "low"].includes(v)) {
        return "high / mid / low 중 하나만 허용";
      }
      return null;
    },
  },
};

// /env — 화이트리스트 env 현재 값 list (Sensitive 라 Vercel 이 마스킹 반환,
// 그대로 표시. 봇 응답에 평문 secret 노출 위험 없음).
export async function envListCommand(): Promise<string> {
  try {
    const envs = await listProjectEnvs();
    const lines = ["[운영 toggle env]", ""];
    for (const [key, spec] of Object.entries(ENV_WHITELIST)) {
      const env = envs.find((e) => e.key === key);
      const cur = env ? maskValue(env.value) : "(미설정)";
      lines.push(`${key} = ${cur}`);
      lines.push(`  ${spec.description}`);
      lines.push(`  /env set ${key} {값}`);
      lines.push("");
    }
    return lines.join("\n");
  } catch (e) {
    return `❌ env 조회 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

// Vercel 이 Sensitive env 는 응답에서 가려서 줌 — 추가 마스킹은 안전 차원.
// 평문 toggle 값 (예: 0.88) 도 그대로 보여줘서 사장님이 직접 확인 가능하게.
function maskValue(v: string): string {
  if (!v) return "(빈 값)";
  // Vercel 이 이미 마스킹한 응답 (예: '*' 다섯개 이상) 은 그대로
  if (/^\*+$/.test(v)) return v;
  return v.length > 30 ? `${v.slice(0, 8)}...` : v;
}

// /env set {KEY} {VALUE}
export async function envSetCommand(args: string): Promise<string> {
  const [key, ...rest] = args.split(/\s+/);
  const value = rest.join(" ").trim();

  if (!key || !value) {
    return "사용법: /env set {KEY} {값}\n예: /env set DEDUPE_AUTO_CONFIRM_THRESHOLD 0.85";
  }
  const spec = ENV_WHITELIST[key];
  if (!spec) {
    const allowed = Object.keys(ENV_WHITELIST).join(", ");
    return `❌ 변경 불가: ${key}\n허용된 KEY: ${allowed}`;
  }
  const validationError = spec.validate(value);
  if (validationError) {
    return `❌ 값 형식 오류: ${validationError}`;
  }

  try {
    await updateProjectEnvByKey(key, value);
    return [
      `✅ env 변경 완료`,
      `${key} = ${value}`,
      "",
      "⚠️ 새 값은 다음 배포부터 적용돼요.",
      "/redeploy 입력하면 즉시 production 재배포.",
    ].join("\n");
  } catch (e) {
    return `❌ env 변경 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}

// /redeploy — 마지막 production 배포 ID 로 새 빌드 트리거.
// git push 없이 env 만 새로 주입. 약 1~2분 소요.
export async function redeployCommand(): Promise<string> {
  try {
    const r = await triggerProductionRedeploy();
    const inspect = r.url
      ? `https://${r.url}`
      : `https://vercel.com/keeper0301-8938s-projects/government-information`;
    return [
      "✅ production 재배포 트리거",
      `deployment_id: ${r.id.slice(0, 16)}...`,
      `url: ${inspect}`,
      "",
      "약 1~2분 후 새 env 값으로 가동.",
    ].join("\n");
  } catch (e) {
    return `❌ 재배포 실패: ${(e as Error).message.slice(0, 200)}`;
  }
}
