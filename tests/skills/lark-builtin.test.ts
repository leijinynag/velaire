import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { loadSkills } from "@/skills/loader";

describe("global Lark skills", () => {
  test("discovers Lark/Feishu skills from the shared agents skill directory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "velaire-lark-skills-"));
    const agentsHome = join(workspace, ".agents", "skills", "lark-im");
    try {
      await mkdir(agentsHome, { recursive: true });
      await writeFile(
        join(agentsHome, "SKILL.md"),
        "---\nname: lark-im\ndescription: 飞书消息助手\n---\n\n# Lark IM\n",
      );

      const skills = await loadSkills({ cwd: workspace, workspace });

      expect(skills.some((skill) => skill.name === "lark-im" && skill.description.includes("飞书"))).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
