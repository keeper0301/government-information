// ============================================================
// 텔레그램 봇 RBAC — 명령별 권한 매트릭스 (owner / staff / dev)
// ============================================================
// 사장님 단독 운영이지만 미래 직원/외주 채용 대비 RBAC 사전 도입.
// 동시에 위험 명령 (env 변경, redeploy, user PII) 격리로 사고 예방.
//
// env 화이트리스트 (콤마 구분, 빈 default 허용):
//   - TELEGRAM_OWNER_CHAT_IDS — 모든 명령 (사장님)
//   - TELEGRAM_STAFF_CHAT_IDS — 컨텐츠 운영 + 검수 (위험 명령 X)
//   - TELEGRAM_DEV_CHAT_IDS  — 시스템 진단 + cron + 로그 (수정 X)
//
// backward compat: 기존 TELEGRAM_CHAT_ID env 가 있으면 owner 로 자동 매핑.
// ============================================================

export type Role = "owner" | "staff" | "dev";

export interface RoleSets {
  owner: string[];
  staff: string[];
  dev: string[];
}

// 명령별 허용 role 집합. owner 는 모든 명령 허용 (default).
// matrix 에 없는 명령 = owner 만 (보수적 default).
type CommandPolicy = ReadonlyArray<Role>;

export const PERMISSION_MATRIX: Readonly<Record<string, CommandPolicy>> = {
  // 모두 허용 — 정보 조회 + 봇 가동 확인
  help: ["owner", "staff", "dev"],
  test: ["owner", "staff", "dev"],
  status: ["owner", "staff", "dev"],
  health: ["owner", "staff", "dev"],
  today: ["owner", "staff", "dev"],
  stats: ["owner", "staff", "dev"],
  admin: ["owner", "staff", "dev"],
  queue: ["owner", "staff", "dev"],

  // 컨텐츠 운영 + 검수 (staff OK, dev X)
  press: ["owner", "staff"],
  dedupe: ["owner", "staff"],
  news: ["owner", "staff"],
  publish: ["owner", "staff"],
  recent: ["owner", "staff"],
  revoke: ["owner", "staff"],
  restore: ["owner", "staff"],

  // 시스템 진단 (dev OK, staff X)
  trigger: ["owner", "dev"],

  // 사장님 전용 — env 변경·재배포·사용자 PII 조회
  env: ["owner"],
  redeploy: ["owner"],
  user: ["owner"],
};

function parseEnvIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// env 에서 role-set 로딩. backward compat — TELEGRAM_CHAT_ID 가 owner 로.
export function loadRoleSets(): RoleSets {
  const ownerExplicit = parseEnvIds(process.env.TELEGRAM_OWNER_CHAT_IDS);
  const ownerLegacy = parseEnvIds(process.env.TELEGRAM_CHAT_ID);
  // 둘 다 있으면 합집합. 중복 제거.
  const owner = Array.from(new Set([...ownerExplicit, ...ownerLegacy]));
  return {
    owner,
    staff: parseEnvIds(process.env.TELEGRAM_STAFF_CHAT_IDS),
    dev: parseEnvIds(process.env.TELEGRAM_DEV_CHAT_IDS),
  };
}

// chatId → role. owner > staff > dev 우선순위 (한 chatId 가 여러 role 등록 시).
// pure function — 테스트 용이.
export function getRole(chatId: number | string, sets: RoleSets): Role | null {
  const id = String(chatId);
  if (sets.owner.includes(id)) return "owner";
  if (sets.staff.includes(id)) return "staff";
  if (sets.dev.includes(id)) return "dev";
  return null;
}

// 명령 실행 가능 여부. matrix 에 없는 명령 = owner 만.
// pure function — 테스트 용이.
export function canExecute(role: Role, command: string): boolean {
  const policy = PERMISSION_MATRIX[command.toLowerCase()];
  if (!policy) return role === "owner";
  return policy.includes(role);
}

// 차단 메시지 (한국어, 비개발자 시각). 사용자에게 보낼 reply.
export function denyMessage(role: Role, command: string): string {
  const policy = PERMISSION_MATRIX[command.toLowerCase()];
  const allowed = policy ? policy.join("/") : "owner";
  return `🚫 /${command} 명령은 ${allowed} 권한이 필요해요. 현재 권한: ${role}.`;
}
