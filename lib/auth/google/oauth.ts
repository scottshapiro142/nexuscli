/**
 * Google OAuth 2.0 token endpoint client.
 * Pure fetch + URLSearchParams — no SDK dependency.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export interface AuthUrlParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scopes: string[];
  /** Force the consent screen — needed to guarantee a refresh_token. */
  forceConsent?: boolean;
}

export function buildAuthUrl(p: AuthUrlParams): string {
  const u = new URL(AUTH_ENDPOINT);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", p.scopes.join(" "));
  u.searchParams.set("code_challenge", p.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", p.state);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("include_granted_scopes", "true");
  if (p.forceConsent) u.searchParams.set("prompt", "consent");
  return u.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface ExchangeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export async function exchangeCode(p: ExchangeParams): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      code_verifier: p.codeVerifier,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
    })
  );
}

export interface RefreshParams {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function refreshAccessToken(p: RefreshParams): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: p.refreshToken,
      client_id: p.clientId,
      client_secret: p.clientSecret,
    })
  );
}

export async function revokeToken(token: string): Promise<void> {
  const res = await fetch(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (!text.includes("invalid_token")) {
      throw new Error(`Revocation failed (${res.status}): ${text || res.statusText}`);
    }
  }
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { error?: string; error_description?: string };
      if (parsed.error) {
        detail = parsed.error_description
          ? `${parsed.error}: ${parsed.error_description}`
          : parsed.error;
      }
    } catch {
      // text is already useful
    }
    throw new Error(`Token endpoint ${res.status}: ${detail}`);
  }
  return JSON.parse(text) as TokenResponse;
}
