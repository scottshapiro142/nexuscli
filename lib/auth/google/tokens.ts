/**
 * Token storage for Google OAuth refresh + access tokens.
 * File: ~/.nexus/auth/google.json (chmod 600).
 */

import * as fs from "node:fs";
import { ensureAuthDir, googleAuthPath } from "@/lib/kernel/paths";

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  /** epoch-ms when access_token expires */
  expires_at: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export function loadTokens(): StoredTokens | null {
  const p = googleAuthPath();
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as StoredTokens;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  ensureAuthDir();
  const p = googleAuthPath();
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, p);
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    // best effort across umask quirks
  }
}

export function deleteTokens(): boolean {
  const p = googleAuthPath();
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

export function isExpiringSoon(tokens: StoredTokens, leewayMs = 60_000): boolean {
  return Date.now() + leewayMs >= tokens.expires_at;
}
