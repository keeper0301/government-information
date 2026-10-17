// Inherited by Vitest workers via NODE_OPTIONS. Tests may replace fetch with fixtures.
/* eslint-disable @typescript-eslint/no-require-imports -- Synchronous Node preload must run before application imports. */
const deny = () => { throw new Error("OFFLINE_TEST_NETWORK_BLOCKED"); };
require("node:net").Socket.prototype.connect = deny;
require("node:http").request = deny;
require("node:http").get = deny;
require("node:https").request = deny;
require("node:https").get = deny;
require("node:dns").lookup = deny;
globalThis.fetch = deny;

// Prevent external binaries or shell commands from bypassing Node network guards.
const cp = require("node:child_process");
const path = require("node:path");
const preload = '--require="' + __filename.replaceAll("\\", "/") + '"';
for (const method of ["spawn", "spawnSync", "execFile", "execFileSync"]) {
  const original = cp[method];
  cp[method] = function (file, args, options, ...rest) {
    const base = path.basename(String(file)).toLowerCase();
    const allowed = base === "node" || base === "node.exe" ||
      (base === "esbuild.exe" && String(file).includes("node_modules"));
    if (!allowed || options?.shell) throw new Error("OFFLINE_TEST_SUBPROCESS_BLOCKED: " + base);
    const opts = { ...(options || {}), env: { ...(options?.env || process.env), NODE_OPTIONS: preload } };
    return original.call(this, file, args, opts, ...rest);
  };
}
cp.exec = (command, callback) => {
  // Vite probes Windows drive mappings; supply an empty local-only fixture.
  if (command === "net use" && typeof callback === "function") { callback(null, "", ""); return; }
  throw new Error("OFFLINE_TEST_SHELL_BLOCKED");
};
cp.execSync = () => { throw new Error("OFFLINE_TEST_SHELL_BLOCKED"); };
require("node:dgram").createSocket = deny;
require("node:module").syncBuiltinESMExports();
