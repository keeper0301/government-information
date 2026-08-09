import { existsSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

export type HumanizeGateSite = "blogfury" | "keepioo" | "punchtravel";

export type HumanizeGateResult = {
  enabled: boolean;
  action: "skipped" | "pass" | "downgrade_to_draft";
  status: "disabled" | "pass" | "review_warning";
  reportPath?: string;
  message?: string;
};

const DEFAULT_GATE = "/home/user/.hermes/scripts/publishing_humanize_gate.py";
const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function shouldRunHumanizeGate(status: "publish" | "draft"): boolean {
  if (status !== "publish") return false;
  const raw = process.env.KEEPIOO_HUMANIZE_GATE_ENABLED;
  if (raw != null) return TRUTHY.has(raw.trim().toLowerCase());
  return existsSync(process.env.KEEPIOO_HUMANIZE_GATE_PATH ?? DEFAULT_GATE);
}

export function applyHumanizeGateToPayload<T extends { title: string; content?: string; body?: string; status?: "publish" | "draft" }>(
  payload: T,
  options: { site?: HumanizeGateSite; keyword?: string } = {},
): T & { humanizeGate?: HumanizeGateResult } {
  const status = payload.status ?? "publish";
  if (!shouldRunHumanizeGate(status)) {
    return { ...payload, humanizeGate: { enabled: false, action: "skipped", status: "disabled" } };
  }

  const gate = process.env.KEEPIOO_HUMANIZE_GATE_PATH ?? DEFAULT_GATE;
  if (!existsSync(gate)) throw new Error(`humanize gate missing: ${gate}`);

  const content = payload.content ?? payload.body ?? "";
  const dir = mkdtempSync(join(tmpdir(), "keepioo-humanize-"));
  const draft = join(dir, "draft.txt");
  writeFileSync(draft, content, "utf8");

  const args = [
    gate,
    "--site",
    options.site ?? "keepioo",
    "--input",
    draft,
    "--after",
    draft,
    "--title",
    payload.title,
  ];
  if (options.keyword) args.push("--keyword", options.keyword);

  const proc = spawnSync(args[0], args.slice(1), { encoding: "utf8", timeout: 30_000 });
  const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;
  const reportPath = output.split(/\r?\n/).find((line) =>
    line.startsWith("/home/") && line.includes("publishing-humanize-gate"),
  );

  if (proc.status === 0) {
    return {
      ...payload,
      humanizeGate: { enabled: true, action: "pass", status: "pass", reportPath },
    };
  }
  if (proc.status === 1) {
    return {
      ...payload,
      status: "draft",
      humanizeGate: {
        enabled: true,
        action: "downgrade_to_draft",
        status: "review_warning",
        reportPath,
        message: output.slice(0, 500),
      },
    };
  }

  throw new Error(`humanize gate blocked publish: ${output.slice(0, 500)}`);
}
