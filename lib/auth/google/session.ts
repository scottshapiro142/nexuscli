/**
 * High-level Google OAuth session — sign in, sign out, fresh-token wrapper.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { loadClientCreds } from "./client-creds";
import { startLoopback } from "./loopback";
import {
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
} from "./oauth";
import { codeChallengeFor, generateCodeVerifier } from "./pkce";
import {
  deleteTokens,
  isExpiringSoon,
  loadTokens,
  saveTokens,
  type StoredTokens,
} from "./tokens";

export const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export interface SignInOptions {
  scopes?: string[];
  /** Force the consent screen even if previously consented. */
  force?: boolean;
  verbose?: boolean;
  timeoutMs?: number;
}

export async function signIn(opts: SignInOptions = {}): Promise<StoredTokens> {
  const scopes = opts.scopes ?? DEFAULT_SCOPES;
  const log = opts.verbose === false ? () => {} : (m: string) => process.stdout.write(m);

  const creds = loadClientCreds();
  const verifier = generateCodeVerifier();
  const challenge = codeChallengeFor(verifier);
  const state = randomBytes(16).toString("hex");

  const loopback = await startLoopback({
    expectedState: state,
    timeoutMs: opts.timeoutMs ?? 300_000,
  });
  const redirectUri = `http://127.0.0.1:${loopback.port}`;
  const url = buildAuthUrl({
    clientId: creds.clientId,
    redirectUri,
    codeChallenge: challenge,
    state,
    scopes,
    forceConsent: opts.force,
  });

  log(`  opening browser for Google sign-in ...\n`);
  log(`  (if it doesn't open, visit: ${url})\n`);
  openBrowser(url);

  let result;
  try {
    result = await loopback.waitForCode();
  } catch (err) {
    loopback.close();
    throw err;
  }

  log(`  exchanging code for tokens ...\n`);
  const tokens = await exchangeCode({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    code: result.code,
    codeVerifier: verifier,
    redirectUri,
  });

  if (!tokens.refresh_token) {
    throw new Error(
      `Google did not return a refresh_token. Run \`nexus auth login google --force\` to force the consent screen.`
    );
  }

  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
    token_type: tokens.token_type,
    id_token: tokens.id_token,
  };
  saveTokens(stored);
  return stored;
}

export async function signOut(opts: { revoke?: boolean } = {}): Promise<{ deleted: boolean }> {
  const tokens = loadTokens();
  if (tokens && opts.revoke !== false) {
    try {
      await revokeToken(tokens.refresh_token);
    } catch {
      // best-effort
    }
  }
  return { deleted: deleteTokens() };
}

/**
 * Run `fn` with a fresh access token. Refreshes proactively if expired,
 * and once retroactively if `fn` rejects with a 401-shaped error.
 */
export async function withFreshAccessToken<T>(
  fn: (accessToken: string) => Promise<T>
): Promise<T> {
  let tokens = loadTokens();
  if (!tokens) {
    throw new Error(`Not signed in. Run \`nexus auth login google\` first.`);
  }

  if (isExpiringSoon(tokens)) {
    tokens = await refreshAndPersist(tokens);
  }

  try {
    return await fn(tokens.access_token);
  } catch (err) {
    if (!is401(err)) throw err;
    const refreshed = await refreshAndPersist(tokens);
    return await fn(refreshed.access_token);
  }
}

async function refreshAndPersist(tokens: StoredTokens): Promise<StoredTokens> {
  const creds = loadClientCreds();
  try {
    const r = await refreshAccessToken({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      refreshToken: tokens.refresh_token,
    });
    const updated: StoredTokens = {
      ...tokens,
      access_token: r.access_token,
      expires_at: Date.now() + r.expires_in * 1000,
      scope: r.scope ?? tokens.scope,
      token_type: r.token_type ?? tokens.token_type,
    };
    if (r.refresh_token) updated.refresh_token = r.refresh_token;
    saveTokens(updated);
    return updated;
  } catch (err) {
    const message = (err as Error).message ?? "";
    if (message.includes("invalid_grant")) {
      deleteTokens();
      throw new Error(
        `Google session expired or revoked. Run \`nexus auth login google\` to sign in again.`
      );
    }
    throw err;
  }
}

function is401(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { status?: number; statusCode?: number; response?: { status?: number } };
  return e.status === 401 || e.statusCode === 401 || e.response?.status === 401;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
    // best-effort; the URL is also printed for the user to copy
  });
  child.unref();
}
