import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { loadAvailableCommands, resolveCommand } from "@/cli/tui/command-registry";

describe("skill slash commands", () => {
  test("loads skills as slash commands and resolves requested skill names", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "velaire-skill-commands-"));
    try {
      const skillDir = path.join(workspace, "skills", "demo");
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo skill\n---\nUse demo.\n");

      const commands = await loadAvailableCommands({ cwd: workspace, workspace });
      const invocation = resolveCommand("/demo-skill hello", commands);

      expect(commands.some((command) => command.name === "demo-skill")).toBe(true);
      expect(invocation).toEqual({ name: "demo-skill", args: "hello", requestedSkillName: "demo-skill" });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
