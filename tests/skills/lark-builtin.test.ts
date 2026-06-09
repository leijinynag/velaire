import { describe, expect, test } from "bun:test";

import { loadSkills } from "@/skills/loader";

describe("built-in Lark skill", () => {
  test("discovers the bundled Lark/Feishu skill", async () => {
    const skills = await loadSkills({ cwd: process.cwd(), workspace: process.cwd() });

    expect(skills.some((skill) => skill.name === "lark" && skill.description.includes("飞书"))).toBe(true);
  });
});
