import { describe, expect, test } from "bun:test";

import { createRuntimeFromConfig } from "@/cli/index";
import type { ApprovalManager } from "@/policy/approval-manager";

describe("runtime approval wiring", () => {
  test("wires approval manager only for interactive runtimes", async () => {
    const config = {
      version: 1 as const,
      defaultModel: "mock",
      agent: { defaultPreset: "coding" },
      models: [],
      settings: { permissions: { allow: [], deny: [] } },
    };
    const manager = { requestApproval: async () => "allow_once" } as Pick<ApprovalManager, "requestApproval">;

    const interactive = await createRuntimeFromConfig(config, { provider: "mock" }, { approvalManager: manager });
    const nonInteractive = await createRuntimeFromConfig(config, { provider: "mock" });

    expect(interactive.hasApprovalHandler()).toBe(true);
    expect(nonInteractive.hasApprovalHandler()).toBe(false);
  });
});
