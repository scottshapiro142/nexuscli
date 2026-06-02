/**
 * `nexus auth login google` / `nexus auth logout google`
 */

import { loadTokens, signIn, signOut } from "@/lib/auth/google";
import { bold, dim, printKV } from "../util";

export interface LoginGoogleOpts {
  force?: boolean;
}

export async function runGoogleLogin(opts: LoginGoogleOpts): Promise<void> {
  process.stdout.write(`${bold("nexus auth login google")}\n`);
  const existing = loadTokens();
  if (existing && !opts.force) {
    process.stdout.write(
      `  ${dim("already signed in. Re-run with --force to re-consent.")}\n`
    );
    return;
  }
  const tokens = await signIn({ force: opts.force, verbose: true });
  process.stdout.write(`\n${bold("done.")}\n`);
  printKV({
    scope: tokens.scope,
    expires_in: `${Math.max(0, Math.round((tokens.expires_at - Date.now()) / 1000))}s`,
    stored_at: `~/.nexus/auth/google.json`,
  });
}

export async function runGoogleLogout(): Promise<void> {
  process.stdout.write(`${bold("nexus auth logout google")}\n`);
  const result = await signOut();
  if (result.deleted) {
    process.stdout.write(`  signed out and removed local token.\n`);
  } else {
    process.stdout.write(`  ${dim("not signed in.")}\n`);
  }
}
