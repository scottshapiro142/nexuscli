/**
 * Resolve registered Google OAuth client credentials for this CLI.
 *
 * Lookup order (highest priority wins):
 *   1. macOS Keychain (service "nexus-google-oauth", accounts "client-id" +
 *      "client-secret") — for Nexus maintainers running from source.
 *   2. Env vars NEXUS_GOOGLE_CLIENT_ID / NEXUS_GOOGLE_CLIENT_SECRET (also
 *      accepts GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET) — for CI
 *      and non-macOS contributors who want to BYO credentials.
 *   3. Built-in constants below — the registered PixelDesigns "Nexus" Desktop
 *      OAuth client. Shipped in the published binary so end users don't need
 *      to create their own Google Cloud project.
 *
 * Why the secret is in source:
 *   Google's "Desktop app" OAuth client type *requires* the client_secret on
 *   every token exchange — empirically verified, see test in PR history — and
 *   Google explicitly states (https://developers.google.com/identity/protocols/oauth2)
 *   that "in this context, the client secret is obviously not treated as a
 *   secret." PKCE-only is not an option for this client type today.
 *
 *   This is the same pattern used by gcloud, gh, firebase, and every other OSS
 *   CLI that OAuths users into Google services. PKCE still protects against
 *   auth-code interception; the embedded "secret" only identifies the app.
 */

import { execFileSync } from "node:child_process";

export interface ClientCreds {
  clientId: string;
  clientSecret: string;
}

const KEYCHAIN_SERVICE = "nexus-google-oauth";

const BUILTIN_CLIENT_ID =
  "187018863285-ph3s7coqr9ddso4he8qm8jvobrckq52b.apps.googleusercontent.com";
// gitleaks:allow — Desktop OAuth client secret, not security-critical per Google.
const BUILTIN_CLIENT_SECRET = "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"; // gitleaks:allow

export function loadClientCreds(): ClientCreds {
  const fromKeychain = process.platform === "darwin" ? tryKeychain() : null;

  const clientId =
    fromKeychain?.clientId ??
    process.env.NEXUS_GOOGLE_CLIENT_ID ??
    process.env.GOOGLE_OAUTH_CLIENT_ID ??
    BUILTIN_CLIENT_ID;
  const clientSecret =
    fromKeychain?.clientSecret ??
    process.env.NEXUS_GOOGLE_CLIENT_SECRET ??
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ??
    BUILTIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth client credentials missing. This indicates a packaging bug — please file an issue at https://github.com/scottshapiro142/nexuscli/issues."
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
