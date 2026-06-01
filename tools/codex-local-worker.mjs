#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const WORKER_DIR = ".codex-local-worker";

async function main() {
  const cwd = process.cwd();
  const outputDir = path.join(cwd, WORKER_DIR);
  mkdirSync(outputDir, { recursive: true });

  const dirty = await runText("git", ["status", "--porcelain"], cwd);
  if (dirty.trim() && process.env.CODEX_LOCAL_WORKER_ALLOW_DIRTY !== "true") {
    writeLog(outputDir, {
      ok: false,
      skipped: true,
      reason: "dirty_worktree",
      message: "작업 폴더에 미저장 변경이 있어 코덱스 자동 작업을 건너뜁니다.",
    });
    return;
  }

  const prompt = buildPrompt();
  const args = [
    "exec",
    "--cd",
    cwd,
    "--sandbox",
    "workspace-write",
    "--output-last-message",
    path.join(outputDir, "last-message.md"),
  ];

  if (process.env.CODEX_LOCAL_WORKER_MODEL) {
    args.push("--model", process.env.CODEX_LOCAL_WORKER_MODEL);
  }

  args.push(prompt);
  const result = await runInherited("codex", args, cwd);
  writeLog(outputDir, {
    ok: result === 0,
    skipped: false,
    exitCode: result,
    output: path.join(outputDir, "last-message.md"),
  });
  process.exitCode = result;
}

function buildPrompt() {
  return [
    "너는 keepioo 사이트의 로컬 코덱스 자동 관리 작업자다.",
    "한국어로만 답하고, 비밀값은 읽거나 출력하지 마라.",
    "목표는 사이트 운영 상태 점검, 버그 후보 찾기, 작은 개선안 작성이다.",
    "결제, 환불, 권한 변경, 비밀값 변경, 운영 데이터 삭제, git push는 하지 마라.",
    "작업 전 `npm run agent:resident:check`로 설정을 확인해라.",
    "문제가 명확하고 작게 고칠 수 있을 때만 최소 수정하고 관련 테스트만 실행해라.",
    "수정이 필요 없으면 `.codex-local-worker/last-message.md`에 운영 보고서만 남겨라.",
  ].join("\n");
}

function runText(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", () => resolve(output));
  });
}

function runInherited(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function writeLog(outputDir, entry) {
  const logPath = path.join(outputDir, "runs.jsonl");
  const line = JSON.stringify({
    checkedAt: new Date().toISOString(),
    ...entry,
  });
  const prefix = existsSync(logPath) ? "\n" : "";
  writeFileSync(logPath, `${prefix}${line}`, { flag: "a" });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
