import assert from "node:assert/strict";
import { test } from "node:test";
import { localSampler } from "../lib/iris/samplers/local";

test("localSampler reports it cannot sample", () => {
  assert.equal(localSampler.kind, "local");
  assert.equal(localSampler.canSample, false);
});

test("localSampler.complete() throws so misuse surfaces immediately", async () => {
  await assert.rejects(
    () => localSampler.complete({ prompt: "anything" }),
    /Local sampler cannot complete/
  );
});

test("resolveSampler honors explicit force when target is available", async () => {
  // Force local — always available — to verify the force path works without
  // needing claude on PATH or an OpenRouter key.
  const mod = await import("../lib/iris/sampler");
  const sampler = await mod.resolveSampler({ force: "local" });
  assert.equal(sampler.kind, "local");
});

test("resolveSampler with force=openrouter throws a clear error when key missing", async () => {
  // Point NEXUS_HOME at a fresh empty dir so the file-based key fallback can't
  // satisfy the lookup either. Both env and file paths must be absent.
  const fsp = await import("node:fs/promises");
  const osMod = await import("node:os");
  const tmp = await fsp.mkdtemp(osMod.tmpdir() + "/nexus-test-");

  const prevHome = process.env.NEXUS_HOME;
  const prevKey = process.env.OPENROUTER_API_KEY;
  process.env.NEXUS_HOME = tmp;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const mod = await import("../lib/iris/sampler");
    await assert.rejects(
      () => mod.resolveSampler({ force: "openrouter" }),
      /OPENROUTER_API_KEY/
    );
  } finally {
    if (prevHome === undefined) delete process.env.NEXUS_HOME;
    else process.env.NEXUS_HOME = prevHome;
    if (prevKey !== undefined) process.env.OPENROUTER_API_KEY = prevKey;
  }
});

test("NEXUS_SAMPLER env is honored when no explicit force is passed", async () => {
  const prev = process.env.NEXUS_SAMPLER;
  process.env.NEXUS_SAMPLER = "local";
  try {
    const mod = await import("../lib/iris/sampler");
    const sampler = await mod.resolveSampler();
    assert.equal(sampler.kind, "local");
  } finally {
    if (prev === undefined) delete process.env.NEXUS_SAMPLER;
    else process.env.NEXUS_SAMPLER = prev;
  }
});
