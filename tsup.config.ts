import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["cli/index.ts"],
  outDir: "dist/cli",
  format: ["cjs"],
  target: "node20",
  platform: "node",
  bundle: true,
  splitting: false,
  clean: true,
  shims: true,
  sourcemap: false,
  minify: false,
  tsconfig: "tsconfig.cli.json",
  external: [
    "better-sqlite3",
    "@modelcontextprotocol/sdk",
    "openai",
    "commander",
    "xlsx",
    "zod",
  ],
});
