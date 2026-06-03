# NexusCLI 0.3.1 Release Plan

## Release theme

Make the OAuth feature shipped in 0.3.0 actually usable from a fresh `npm install`.

0.3.0 introduced the Google OAuth surface, but the published binary only resolved client credentials from the macOS keychain or environment variables — paths that no end user has set up. As a result, every fresh-install user hit `Google OAuth client credentials not configured` on first run. 0.3.1 bakes the registered PixelDesigns "Nexus" Desktop OAuth client into the binary so the feature works zero-config.

## Scope

### Included

- `lib/auth/google/client-creds.ts` ships built-in `BUILTIN_CLIENT_ID` + `BUILTIN_CLIENT_SECRET` constants as the third tier in the resolution chain. Keychain and env-var overrides still take precedence — Nexus maintainers continue to use ephemeral creds locally.
- Inline `// gitleaks:allow` markers documenting the Desktop OAuth secret as deliberately committed.
- Updated module docblock citing Google's guidance that Desktop-client secrets are "obviously not treated as a secret."
- Error message rewritten for the (now nearly-unreachable) credential-missing path — points at the GitHub issues tracker rather than asking users to configure keychain.

### Not changed

- OAuth flow, scopes (`spreadsheets.readonly`), or token storage layout — identical to 0.3.0.
- Sheets API path or kernel — no functional changes outside `client-creds.ts`.

## Why the embedded secret is acceptable

Google's "Desktop app" client type requires `client_secret` on every token exchange — empirically verified against `oauth2.googleapis.com/token`. PKCE protects against auth-code interception but does not replace the secret for this client type. Google explicitly states (https://developers.google.com/identity/protocols/oauth2) that in this context the secret "is obviously not treated as a secret." Every comparable OSS CLI that OAuths users into Google services ships its own embedded client secret — `gcloud`, `gh`, `firebase`, `npm`.

## Verification checklist

```bash
npm run build:cli
grep -c "GOCSPX-" dist/cli/index.js              # expect 1
grep -c "187018863285" dist/cli/index.js         # expect 1

# Smoke test — should reach the consent screen with no NEXUS_GOOGLE_* env vars set
# and no keychain entries (e.g. on a fresh non-darwin machine or in a clean shell):
node dist/cli/index.js auth login google
```

## Publish

```bash
npm version 0.3.1 --no-git-tag-version   # already done — package.json bumped
npm run build:cli
npm publish --access public
git tag v0.3.1
git push origin v0.3.1
```

## Deferred (still)

- Selective cloud publishing.
- Project grouping / multi-sheet MCP surface.
- Local web UI as a third surface.
- GCP "Testing" → "Production" flip (requires privacy policy live at nexuscli.dev/privacy first).
- Formal Google verification (removes the "unverified app" warning).
