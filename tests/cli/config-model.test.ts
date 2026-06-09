import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";
import { parse } from "yaml";

const projectRoot = new URL("../..", import.meta.url).pathname;

describe("velaire CLI config model", () => {
  test("adds, lists, sets default, and removes models in isolated VELAIRE_HOME", async () => {
    const velaireHome = await mkdtemp(path.join(tmpdir(), "velaire-config-model-"));
    try {
      const firstAdd = await runCli(
        [
          "config",
          "model",
          "add",
          "--name",
          "claude-main",
          "--provider",
          "anthropic",
          "--model",
          "claude-sonnet-4-5",
          "--api-key",
          "sk-ant-test",
        ],
        velaireHome,
      );
      expect(firstAdd.exitCode).toBe(0);
      expect(firstAdd.stderr).toBe("");
      expect(firstAdd.stdout).toContain('Model "claude-main" added.');

      const secondAdd = await runCli(
        [
          "config",
          "model",
          "add",
          "--name",
          "local-qwen",
          "--provider",
          "openai-compatible",
          "--model",
          "qwen3-coder",
          "--api-key",
          "sk-qwen-test",
          "--base-url",
          "https://dashscope.example/v1",
        ],
        velaireHome,
      );
      expect(secondAdd.exitCode).toBe(0);
      expect(secondAdd.stderr).toBe("");

      const list = await runCli(["config", "model", "list"], velaireHome);
      expect(list.exitCode).toBe(0);
      expect(list.stderr).toBe("");
      expect(list.stdout).toContain("Default model: claude-main");
      expect(list.stdout).toContain("claude-main (default)");
      expect(list.stdout).toContain("local-qwen");
      expect(list.stdout).toContain("Provider: anthropic");
      expect(list.stdout).toContain("Model: qwen3-coder");
      expect(list.stdout).toContain("Base URL: https://dashscope.example/v1");
      expect(list.stdout).toContain("API Key: ****test");

      const setDefault = await runCli(["config", "model", "set-default", "local-qwen"], velaireHome);
      expect(setDefault.exitCode).toBe(0);
      expect(setDefault.stderr).toBe("");
      expect(setDefault.stdout).toContain('Default model set to "local-qwen".');

      const failedDefault = await runCli(["config", "model", "set-default", "missing"], velaireHome);
      expect(failedDefault.exitCode).toBe(1);
      expect(failedDefault.stderr).toContain('Model "missing" not found.');

      const remove = await runCli(["config", "model", "remove", "local-qwen"], velaireHome);
      expect(remove.exitCode).toBe(0);
      expect(remove.stderr).toBe("");
      expect(remove.stdout).toContain('Model "local-qwen" removed.');

      const config = parse(await readFile(path.join(velaireHome, "config.yaml"), "utf8"));
      expect(config.defaultModel).toBe("claude-main");
      expect(config.models).toHaveLength(1);
      expect(config.models[0]).toMatchObject({
        name: "claude-main",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: "sk-ant-test",
        baseURL: null,
      });
    } finally {
      await rm(velaireHome, { recursive: true, force: true });
    }
  });

  test("does not allow removing the last configured model", async () => {
    const velaireHome = await mkdtemp(path.join(tmpdir(), "velaire-config-model-"));
    try {
      await runCli(
        [
          "config",
          "model",
          "add",
          "--name",
          "only-model",
          "--provider",
          "anthropic",
          "--model",
          "claude-sonnet-4-5",
          "--api-key",
          "sk-ant-test",
        ],
        velaireHome,
      );

      const remove = await runCli(["config", "model", "remove", "only-model"], velaireHome);
      expect(remove.exitCode).toBe(1);
      expect(remove.stderr).toContain("Cannot remove the last model.");
    } finally {
      await rm(velaireHome, { recursive: true, force: true });
    }
  });
});

async function runCli(args: string[], velaireHome: string) {
  const proc = Bun.spawn(["bun", "index.ts", ...args], {
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
  return { stdout, stderr, exitCode };
}
