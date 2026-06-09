import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { evaluatePolicy } from "@/policy/engine";
import { codingPreset } from "@/presets/coding";
import { MockModelProvider } from "@/providers/mock/provider";
import { AgentRuntime } from "@/runtime/agent-runtime";

const REQUIRED_CODING_TOOLS = [
  "bash",
  "read_file",
  "write_file",
  "str_replace",
  "list_files",
  "glob_search",
  "grep_search",
  "apply_patch",
  "file_info",
  "mkdir",
  "move_path",
  "todo_write",
  "ask_user_question",
];

describe("coding preset", () => {
  test("describes Velaire coding agent and includes working directory", async () => {
    const systemPrompt = await codingPreset.createSystemPrompt({ cwd: "/tmp/project" });

    expect(codingPreset.name).toBe("coding");
    expect(codingPreset.description).toContain("coding");
    expect(systemPrompt).toContain("Velaire");
    expect(systemPrompt).not.toContain("Helixent");
    expect(systemPrompt).toContain('<working_directory dir="/tmp/project/" />');
    expect(systemPrompt).toContain("Prefer list_files or glob_search");
  });

  test("registers all required coding tools", () => {
    const registry = codingPreset.createTools();
    const toolNames = registry.list().map((tool) => tool.name);

    expect(toolNames).toEqual(REQUIRED_CODING_TOOLS);
  });

  test("keeps AGENTS.md guidance out of the system prompt", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "velaire-coding-preset-"));
    try {
      await writeFile(join(cwd, "AGENTS.md"), "Project rule: use TDD.\n");

      const systemPrompt = await codingPreset.createSystemPrompt({ cwd });

      expect(systemPrompt).not.toContain("AGENTS.md");
      expect(systemPrompt).not.toContain("Project rule: use TDD.");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("marks risky coding tools so the default policy asks before use", () => {
    const registry = codingPreset.createTools();

    for (const toolName of ["bash", "write_file", "str_replace", "apply_patch", "mkdir", "move_path"]) {
      const tool = registry.get(toolName);
      const decision = evaluatePolicy({ toolName, input: {}, cwd: "/tmp/project", source: "model", capabilities: tool.capabilities, risk: tool.risk });

      expect(decision.decision).toBe("ask");
    }
  });

  test("can configure the runtime", async () => {
    const runtime = new AgentRuntime({
      provider: new MockModelProvider(),
      systemPrompt: await codingPreset.createSystemPrompt({ cwd: "/tmp/project" }),
      tools: codingPreset.createTools(),
      cwd: "/tmp/project",
    });

    const events = [];
    for await (const event of runtime.run("List available tools")) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual(expect.objectContaining({ type: "agent.run.completed" }));
    expect(runtime.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "Mock response" }] });
  });
});
