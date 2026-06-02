/**
 * Resolve registered Google OAuth client credentials for this CLI.
 *
 * Lookup order:
 *   1. macOS Keychain (service "nexus-google-oauth", accounts "client-id" + "client-secret")
 *   2. Env vars NEXUS_GOOGLE_CLIENT_ID / NEXUS_GOOGLE_CLIENT_SECRET
 *      (also accepts GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET for dev)
 */

import { execFileSync } from "node:child_process";

export interface ClientCreds {
  clientId: string;
  clientSecret: string;
}

const KEYCHAIN_SERVICE = "nexus-google-oauth";

export function loadClientCreds(): ClientCreds {
  const fromKeychain = process.platform === "darwin" ? tryKeychain() : null;

  const clientId =
    fromKeychain?.clientId ??
    process.env.NEXUS_GOOGLE_CLIENT_ID ??
    process.env.GOOGLE_OAUTH_CLIENT_ID ??
    "";
  const clientSecret =
    fromKeychain?.clientSecret ??
    process.env.NEXUS_GOOGLE_CLIENT_SECRET ??
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ??
    "";

  if (!clientId || !clientSecret) {
    throw new Error(
      [
        "Google OAuth client credentials not configured.",
        "",
        "On macOS, store them in the login keychain:",
        `  security add-generic-password -U -a client-id     -s ${KEYCHAIN_SERVICE} -w <CLIENT_ID>`,
        `  security add-generic-password -U -a client-secret -s ${KEYCHAIN_SERVICE} -w <CLIENT_SECRET>`,
        "",
        "Or set NEXUS_GOOGLE_CLIENT_ID and NEXUS_GOOGLE_CLIENT_SECRET in the environment.",
      ].join("\n")
    );
  }
  return { clientId, clientSecret };
}

function tryKeychain(): ClientCreds | null {
  try {
    const clientId = readKeychain("client-id");
    const clientSecret = readKeychain("client-secret");
    if (clientId && clientSecret) return { clientId, clientSecret };
    return null;
  } catch {
    return null;
  }
}

function readKeychain(account: string): string {
  const out = execFileSync(
    "security",
    ["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE, "-w"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  return out.trim();
}
