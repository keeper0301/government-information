import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadSecretEnvFile, redactUrl, requireSecret } from "@/tools/keepioo-authenticated-readback.mjs";

describe("keepioo authenticated readback tool", () => {
  it("loads test login secrets only from a 0600 env file", () => {
    const dir = mkdtempSync(join(tmpdir(), "keepioo-auth-readback-"));
    try {
      const file = join(dir, "login.env");
      writeFileSync(file, "KEEPIOO_TEST_EMAIL='tester@example.com'\nKEEPIOO_TEST_PASSWORD=secret-password\n");
      chmodSync(file, 0o600);
      const env = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

      const result = loadSecretEnvFile(file, env);

      expect(result.loaded).toBe(true);
      expect(env.KEEPIOO_TEST_EMAIL).toBe("tester@example.com");
      expect(env.KEEPIOO_TEST_PASSWORD).toBe("secret-password");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when the secret file is group/world-readable", () => {
    const dir = mkdtempSync(join(tmpdir(), "keepioo-auth-readback-"));
    try {
      const file = join(dir, "login.env");
      writeFileSync(file, "KEEPIOO_TEST_EMAIL=tester@example.com\n");
      chmodSync(file, 0o644);

      expect(() => loadSecretEnvFile(file, { NODE_ENV: "test" } as NodeJS.ProcessEnv)).toThrow(/secret_env_too_permissive/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when required secrets are absent", () => {
    expect(() => requireSecret({ NODE_ENV: "test" } as NodeJS.ProcessEnv, "KEEPIOO_TEST_EMAIL")).toThrow("missing_secret:KEEPIOO_TEST_EMAIL");
  });

  it("redacts auth-like callback values from reported URLs", () => {
    expect(redactUrl("https://www.keepioo.com/auth/callback?code=abc&next=/mypage&access_token=def")).toBe(
      "https://www.keepioo.com/auth/callback?code=[REDACTED]&next=/mypage&access_token=[REDACTED]",
    );
  });
});
