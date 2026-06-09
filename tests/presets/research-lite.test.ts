import { describe, expect, test } from "bun:test";

import { researchLitePreset } from "@/presets/research-lite";
import { MockModelProvider } from "@/providers/mock/provider";
import { AgentRuntime } from "@/runtime/agent-runtime";

describe("research-lite preset", () => {
  test("describes a no-coding research assistant", () => {
    expect(researchLitePreset.name).toBe("research-lite");
    expect(researchLitePreset.description).toContain("research");
    expect(researchLitePreset.description).toContain("without coding tools");

    const systemPrompt = researchLitePreset.createSystemPrompt({ cwd: "/tmp/project" });

    expect(systemPrompt).toContain("research-lite");
    expect(systemPrompt).toContain("/tmp/project");
    expect(systemPrompt).toContain("Do not write or modify code");
    expect(researchLitePreset.createTools().list()).toEqual([]);
  });

  test("can configure the runtime", async () => {
    const runtime = new AgentRuntime({
      provider: new MockModelProvider(),
      systemPrompt: researchLitePreset.createSystemPrompt({ cwd: "/tmp/project" }),
      tools: researchLitePreset.createTools(),
    });

    const events = [];
    for await (const event of runtime.run("hello")) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual(expect.objectContaining({ type: "agent.run.completed" }));
    expect(runtime.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "Mock response" }] });
  });
});
