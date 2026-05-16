// ============================================================
// GitHub API wrapper — D-4 step 3 자동 commit + PR 생성
// ============================================================
// Vercel function 은 filesystem read-only → git push 불가능.
// GitHub Contents/Refs/Pulls API 로 직접 file update + branch + PR.
//
// 환경변수:
//   - GITHUB_TOKEN: scope contents:write, pull_requests:write (PAT or App)
//   - GITHUB_REPO_OWNER (기본 "keeper0301")
//   - GITHUB_REPO_NAME (기본 "government-information")
// ============================================================

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_BASE_BRANCH = "master";

function getCredentials() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN 환경변수 누락");
  const owner = process.env.GITHUB_REPO_OWNER ?? "keeper0301";
  const repo = process.env.GITHUB_REPO_NAME ?? "government-information";
  return { token, owner, repo };
}

async function ghFetch(
  path: string,
  init: RequestInit,
  expected = 200,
): Promise<unknown> {
  const { token } = getCredentials();
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "keepioo-d4-auto-fix-bot",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (res.status !== expected && res.status !== 201) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

type RefResponse = { object?: { sha?: string } };

// base branch (master) 의 최신 SHA
async function getBaseSha(): Promise<string> {
  const { owner, repo } = getCredentials();
  const data = (await ghFetch(
    `/repos/${owner}/${repo}/git/refs/heads/${DEFAULT_BASE_BRANCH}`,
    { method: "GET" },
  )) as RefResponse;
  const sha = data.object?.sha;
  if (!sha) throw new Error("base branch SHA 누락");
  return sha;
}

// 새 branch 생성. 이미 있으면 throw.
export async function createBranch(branchName: string): Promise<void> {
  const { owner, repo } = getCredentials();
  const baseSha = await getBaseSha();
  await ghFetch(
    `/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    },
    201,
  );
}

type ContentResponse = { content?: string; sha?: string; encoding?: string };

// 파일 현재 내용 fetch (base64 디코드) + sha.
export async function getFileContent(
  filePath: string,
  ref = DEFAULT_BASE_BRANCH,
): Promise<{ content: string; sha: string }> {
  const { owner, repo } = getCredentials();
  const data = (await ghFetch(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${ref}`,
    { method: "GET" },
  )) as ContentResponse;
  if (!data.content || !data.sha) {
    throw new Error(`파일 ${filePath} content 또는 sha 누락`);
  }
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  return { content: decoded, sha: data.sha };
}

// 파일 update (branch 에 commit). file 신규 생성 X — 기존 파일만.
export async function updateFile(opts: {
  filePath: string;
  newContent: string;
  message: string;
  branch: string;
  sha: string; // base branch 의 sha (충돌 차단)
}): Promise<void> {
  const { owner, repo } = getCredentials();
  await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(opts.filePath)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: opts.message,
      content: Buffer.from(opts.newContent, "utf-8").toString("base64"),
      sha: opts.sha,
      branch: opts.branch,
    }),
  });
}

type PullResponse = { html_url?: string; number?: number };

// PR 생성. 사장님 1 클릭 merge link 반환.
export async function createPullRequest(opts: {
  branch: string;
  title: string;
  body: string;
}): Promise<{ url: string; number: number }> {
  const { owner, repo } = getCredentials();
  const data = (await ghFetch(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({
        title: opts.title,
        head: opts.branch,
        base: DEFAULT_BASE_BRANCH,
        body: opts.body,
      }),
    },
    201,
  )) as PullResponse;
  if (!data.html_url || !data.number) {
    throw new Error("PR 생성 응답 누락");
  }
  return { url: data.html_url, number: data.number };
}
