import { describe, expect, test } from "bun:test";

import { ApprovalManager } from "@/policy/approval-manager";

describe("approval manager", () => {
  test("queues requests and resolves decisions", async () => {
    const manager = new ApprovalManager();
    const seen: string[] = [];
    manager.subscribe((request) => {
      if (request) {
        seen.push(request.toolName);
      }
    });

    const promise = manager.requestApproval({ toolUseId: "toolu_1", toolName: "bash", input: {} });
    manager.respond("allow_once");

    await expect(promise).resolves.toBe("allow_once");
    expect(seen).toEqual(["bash"]);
  });

  test("denies when queue overflows", async () => {
    const manager = new ApprovalManager({ maxQueueSize: 0 });

    await expect(manager.requestApproval({ toolUseId: "toolu_1", toolName: "bash", input: {} })).resolves.toBe("deny");
  });
});
