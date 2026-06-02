/**
 * PKCE helpers for OAuth 2.0 Authorization Code flow (RFC 7636, S256).
 */

import { createHash, randomBytes } from "node:crypto";

export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

export function codeChallengeFor(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
