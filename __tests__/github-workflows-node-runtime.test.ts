import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflowsDir = resolve(process.cwd(), ".github/workflows");
const workflowFiles = readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));

describe("GitHub workflow Node runtimes", () => {
  it("does not pin any workflow job to deprecated Node 20", () => {
    const offenders = workflowFiles.flatMap((name) => {
      const workflow = readFileSync(resolve(workflowsDir, name), "utf8");
      return workflow.includes('node-version: "20"') || workflow.includes("node-version: '20'") || workflow.includes("Node 20")
        ? [name]
        : [];
    });

    expect(offenders).toEqual([]);
  });

  it("uses a Node-24-compatible upload-artifact action when artifacts are uploaded", () => {
    const offenders = workflowFiles.flatMap((name) => {
      const workflow = readFileSync(resolve(workflowsDir, name), "utf8");
      return workflow.includes("actions/upload-artifact@v4") ? [name] : [];
    });

    expect(offenders).toEqual([]);
  });
});
