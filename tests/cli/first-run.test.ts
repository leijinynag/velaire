import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";
import { parse } from "yaml";

const projectRoot = new URL("../..", import.meta.url).pathname;

describe("velaire first-run behavior", () => {
  test("config commands do not block on first-run wizard when no config exists", async () => {
    const velaireHome = await mkdtemp(path.join(tmpdir(), "velaire-first-run-"));
    try {
      const proc = Bun.spawn(["bun", "index.ts", "config", "model", "list"], {
        cwd: projectRoot,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, VELAIRE_HOME: velaireHome },
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("No models configured.");
    } finally {
      await rm(velaireHome, { recursive: true, force: true });
    }
  });

  test("run command writes first-run config from non-interactive model options before executing", async () => {
    const velaireHome = await mkdtemp(path.join(tmpdir(), "velaire-first-run-"));
    try {
      const proc = Bun.spawn(
        [
          "bun",
          "index.ts",
          "run",
          "--provider",
          "mock",
          "--preset",
          "research-lite",
          "--prompt",
          "hello",
          "--model-name",
          "mock-default",
          "--model-provider",
          "anthropic",
          "--model",
          "claude-sonnet-4-5",
          "--api-key",
          "sk-ant-test",
        ],
        {
          cwd: projectRoot,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, VELAIRE_HOME: velaireHome },
        },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toBe("Mock response\n");

      const config = parse(await readFile(path.join(velaireHome, "config.yaml"), "utf8"));
      expect(config.defaultModel).toBe("mock-default");
      expect(config.models).toHaveLength(1);
      expect(config.models[0]).toMatchObject({
        name: "mock-default",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: "sk-ant-test",
        baseURL: null,
      });
    } finally {
      await rm(velaireHome, { recursive: true, force: true });
    }
  });
});
