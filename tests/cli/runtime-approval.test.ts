import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createRuntimeFromConfig } from "@/cli/index";
import type { ApprovalManager } from "@/policy/approval-manager";

describe("runtime approval wiring", () => {
  const config = {
    version: 1 as const,
    defaultModel: "mock",
    agent: { defaultPreset: "coding" },
    models: [],
    settings: { permissions: { allow: [], deny: [] } },
  };

  test("wires approval manager only for interactive runtimes", async () => {
    const manager = { requestApproval: async () => "allow_once" } as Pick<ApprovalManager, "requestApproval">;

    const interactive = await createRuntimeFromConfig(config, { provider: "mock" }, { approvalManager: manager });
    const nonInteractive = await createRuntimeFromConfig(config, { provider: "mock" });

    expect(interactive.hasApprovalHandler()).toBe(true);
    expect(nonInteractive.hasApprovalHandler()).toBe(false);
  });

  test("loads AGENTS.md into the default coding runtime path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "velaire-cli-runtime-"));
    const previousCwd = process.cwd();
    try {
      await writeFile(join(cwd, "AGENTS.md"), "Project rule: prefer tests first.");
      process.chdir(cwd);

      const runtime = await createRuntimeFromConfig(config, { provider: "mock" });

      expect(runtime.messages[0]).toEqual({
        role: "user",
        content: [{ type: "text", text: "> The `AGENTS.md` file has been automatically loaded. Here is the content:\n\nProject rule: prefer tests first." }],
      });
    } finally {
      process.chdir(previousCwd);
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
