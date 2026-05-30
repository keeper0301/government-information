// ============================================================
// Vercel REST API helper — 봇 /env, /redeploy 명령 백엔드.
// ============================================================
// 사장님 발급 PAT (process.env.VERCEL_TOKEN, 1년 만료) 로 government-information
// 프로젝트 env 변경 + production 재배포 트리거. 다른 프로젝트는 건드리지 않음.
//
// API endpoint 출처: Vercel REST API docs (context7 검증, 2026-05-09).
// - GET  /v9/projects/{name}/env             — env list (envId 조회)
// - PATCH /v9/projects/{name}/env/{envId}    — env 변경
// - GET  /v6/deployments                     — 최근 production 배포 조회
// - POST /v13/deployments                    — deploymentId 로 redeploy
//
// team slug 인증: ?slug=keeper0301-8938s-projects 쿼리. team ID 는 환경변수
// 주입 안 해도 slug 만으로 충분.
// ============================================================

const VERCEL_API = "https://api.vercel.com";
const PROJECT_NAME = "government-information";
const TEAM_SLUG = "keeper0301-8938s-projects";

export interface VercelEnv {
  id: string;
  key: string;
  value: string;
  target: string[];
  type: string;
}

interface DeploymentRow {
  uid: string;
  name: string;
  state?: string;
  target?: string | null;
  createdAt?: number;
}

// 공통 fetch — Bearer 인증 + slug 쿼리 자동 합성. 200자로 에러 슬라이스 (텔레그램 응답 길이).
async function vercelFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN env 미설정 (Vercel PAT)");

  const sep = path.includes("?") ? "&" : "?";
  const url = `${VERCEL_API}${path}${sep}slug=${TEAM_SLUG}`;

  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Vercel API ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

// ─── env ────────────────────────────────────────────────────

export async function listProjectEnvs(): Promise<VercelEnv[]> {
  const r = await vercelFetch<{ envs: VercelEnv[] }>(
    `/v9/projects/${PROJECT_NAME}/env`,
  );
  return r.envs;
}

// 단일 env 변경. PATCH body 는 key 필수 (rename 안 하면 같은 값 재전송).
// target 은 기존 그대로 유지 — 봇은 production+preview 만 변경, 사장님 의도 보존.
export async function updateProjectEnvByKey(
  key: string,
  value: string,
): Promise<{ id: string; key: string; value: string }> {
  const envs = await listProjectEnvs();
  const env = envs.find((e) => e.key === key);
  if (!env) throw new Error(`env ${key} 가 프로젝트에 없음 (먼저 Vercel UI 에서 추가)`);

  const r = await vercelFetch<{ id: string; key: string; value: string }>(
    `/v9/projects/${PROJECT_NAME}/env/${env.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        key: env.key,
        value,
        target: env.target,
        type: env.type,
      }),
    },
  );
  return r;
}

// ─── redeploy ───────────────────────────────────────────────

// 가장 최근 production 배포 1건 — deploymentId 회수용.
async function getLastProductionDeployment(): Promise<DeploymentRow> {
  const r = await vercelFetch<{ deployments: DeploymentRow[] }>(
    `/v6/deployments?app=${PROJECT_NAME}&target=production&limit=1`,
  );
  const last = r.deployments?.[0];
  if (!last) throw new Error("최근 production 배포 없음");
  return last;
}

// 2026-05-31 — Critical #2 polling fallback. deployment state 조회.
// READY=build 완료(광고 가동), ERROR/CANCELED=실패. BUILDING/QUEUED=진행 중.
export async function getDeploymentById(
  deploymentId: string,
): Promise<{ id: string; state: string; url?: string }> {
  const r = await vercelFetch<{ id: string; state?: string; url?: string }>(
    `/v13/deployments/${deploymentId}`,
  );
  return { id: r.id, state: r.state ?? "UNKNOWN", url: r.url };
}

// 마지막 prod 배포 redeployment — git 코드 변경 없이 새 build 트리거.
// 새 env 값이 build env 에 주입되면서 적용.
export async function triggerProductionRedeploy(): Promise<{
  id: string;
  url?: string;
}> {
  const last = await getLastProductionDeployment();
  const r = await vercelFetch<{ id: string; url?: string }>(`/v13/deployments`, {
    method: "POST",
    body: JSON.stringify({
      name: last.name || PROJECT_NAME,
      deploymentId: last.uid,
      target: "production",
    }),
  });
  return r;
}
