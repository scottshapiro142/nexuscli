import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const cliArgs = ["--import", "tsx", "cli/index.ts"];

function runNexus(args: string[]): string {
  return execFileSync(process.execPath, [...cliArgs, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NEXUS_HOME: "/tmp/nexus-cli-auth-alias-test" },
  });
}

test("top-level login/logout aliases are exposed for the Google auth flow", () => {
  const help = runNexus(["--help"]);

  assert.match(help, /login \[options\] <provider>/);
  assert.match(help, /logout <provider>/);
});
