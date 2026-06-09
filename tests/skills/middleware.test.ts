import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { createSkillsMiddleware } from "@/skills/middleware";

const tempRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function writeSkill(root: string, name: string, description: string): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const skillPath = path.join(dir, "SKILL.md");
  writeFileSync(skillPath, `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`);
  return skillPath;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("skills middleware", () => {
  test("adds discovered skills block to the system prompt", async () => {
    const workspace = tempDir("velaire-workspace-");
    const skillPath = writeSkill(path.join(workspace, "skills"), "coding-plan", "Plan code changes");
    const middleware = createSkillsMiddleware({ workspace, cwd: workspace });
    const modelContext = { systemPrompt: "You are Velaire.", messages: [] };

    await middleware.beforeModel?.({ transcript: { messages: [] }, modelContext, agentContext: { messages: [], systemPrompt: modelContext.systemPrompt } });

    expect(modelContext.systemPrompt).toContain("<skill_system>");
    expect(modelContext.systemPrompt).toContain('<skill name="coding-plan"');
    expect(modelContext.systemPrompt).toContain(`path="${skillPath}"`);
    expect(modelContext.systemPrompt).toContain("Plan code changes");
  });

  test("includes an explicitly requested skill name in the prompt block", async () => {
    const workspace = tempDir("velaire-workspace-");
    const skillPath = writeSkill(path.join(workspace, "skills"), "deep-research-plan", "Plan research work");
    const middleware = createSkillsMiddleware({ workspace, cwd: workspace, requestedSkillName: "deep-research-plan" });
    const modelContext = { systemPrompt: "Base prompt", messages: [] };

    await middleware.beforeModel?.({ transcript: { messages: [] }, modelContext, agentContext: { messages: [], systemPrompt: modelContext.systemPrompt } });

    expect(modelContext.systemPrompt).toContain("<explicit_skill_invocation>");
    expect(modelContext.systemPrompt).toContain('selected the skill "deep-research-plan"');
    expect(modelContext.systemPrompt).toContain(skillPath);
  });
});
