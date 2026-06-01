/**
 * `nexus config` — manage user-level settings stored in ~/.nexus/config.json.
 *
 * Subcommands:
 *   nexus config get                 Print current resolved config (secrets masked).
 *   nexus config set-key [<key>]     Store OpenRouter API key. Prompts if omitted
 *                                    or reads from stdin if piped.
 *   nexus config unset-key           Remove the stored OpenRouter API key.
 *   nexus config path                Print the absolute config file path.
 */

import * as readline from "node:readline";
import {
  clearOpenRouterKey,
  configFilePath,
  describeKeySource,
  getOpenRouterKey,
  maskKey,
  setOpenRouterKey,
} from "@/lib/kernel/config";
import { bold, dim, printKV } from "../util";

export async function runConfigGet(): Promise<void> {
  const key = getOpenRouterKey();
  const source = describeKeySource();
  process.stdout.write(`${bold("nexus config")}\n`);
  printKV({
    "config file": configFilePath(),
    "openrouter key": key ? `${maskKey(key)}  ${dim(`(${source})`)}` : dim("(not set)"),
  });
  if (!key) {
    process.stdout.write(
      `\nSet one with: nexus config set-key <key>\nGet a key at: https://openrouter.ai/keys\n`
    );
  }
}

export async function runConfigSetKey(rawKey?: string): Promise<void> {
  const key = (rawKey ?? (await readKeyFromStdinOrPrompt())).trim();
  if (!key) throw new Error("No key provided.");
  setOpenRouterKey(key);
  process.stdout.write(
    `${bold("nexus config set-key")} ${dim("→")} stored ${maskKey(key)} in ${configFilePath()}\n`
  );
  if (process.env.OPENROUTER_API_KEY) {
    process.stdout.write(
      dim(
        "  note: OPENROUTER_API_KEY env var is also set — env always wins over the config file.\n"
      )
    );
  }
}

export async function runConfigUnsetKey(): Promise<void> {
  clearOpenRouterKey();
  process.stdout.write(`${bold("nexus config unset-key")} ${dim("→")} removed.\n`);
}

export function runConfigPath(): void {
  process.stdout.write(`${configFilePath()}\n`);
}

async function readKeyFromStdinOrPrompt(): Promise<string> {
  // If piped (echo "sk-..." | nexus config set-key), consume stdin.
  if (!process.stdin.isTTY) {
    return new Promise<string>((resolve, reject) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        buf += chunk;
      });
      process.stdin.on("end", () => resolve(buf));
      process.stdin.on("error", reject);
    });
  }

  // Otherwise prompt interactively. Echoes the input — we don't have a
  // cross-platform hidden-input primitive without a dependency, and the user
  // is on their own machine.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolve) => {
      rl.question("OpenRouter API key: ", (answer) => resolve(answer));
    });
  } finally {
    rl.close();
  }
}
