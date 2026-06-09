import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { discoverSkillFiles, loadSkill, loadSkillFrontmatter, loadSkills } from "@/skills/loader";

const tempRoots: string[] = [];
const originalVelaireHome = process.env.VELAIRE_HOME;

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function writeSkill(root: string, name: string, frontmatter: Record<string, string>, body = "Body"): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const skillPath = path.join(dir, "SKILL.md");
  writeFileSync(skillPath, `---\n${yaml}\n---\n${body}\n`);
  return skillPath;
}

afterEach(() => {
  process.env.VELAIRE_HOME = originalVelaireHome;
  for (const root of tempRoots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe("skills loader", () => {
  test("parses frontmatter and validates required name and description", async () => {
    const root = tempDir("velaire-skills-");
    const validPath = writeSkill(root, "planner", { name: "planner", description: "Plan work" }, "Use a plan.");
    const skill = await loadSkill(validPath);

    expect(skill).toEqual({ name: "planner", description: "Plan work", path: validPath, content: "Use a plan.\n" });

    const frontmatter = await loadSkillFrontmatter(validPath);
    expect(frontmatter).toEqual({ name: "planner", description: "Plan work", path: validPath });

    const invalidPath = writeSkill(root, "missing-description", { name: "bad" });
    await expect(loadSkill(invalidPath)).rejects.toThrow("Skill frontmatter in");
  });

  test("discovers default skill locations and dedupes duplicate full paths", async () => {
    const workspace = tempDir("velaire-workspace-");
    const home = tempDir("velaire-home-");
    process.env.VELAIRE_HOME = home;

    const projectAgentsPath = writeSkill(path.join(workspace, ".agents", "skills"), "project-agent", {
      name: "project-agent",
      description: "Workspace agents skill",
    });
    const projectVelairePath = writeSkill(path.join(workspace, ".velaire", "skills"), "project-velaire", {
      name: "project-velaire",
      description: "Workspace Velaire skill",
    });
    const homePath = writeSkill(path.join(home, "skills"), "home-skill", {
      name: "home-skill",
      description: "VELAIRE_HOME skill",
    });
    const cwdPath = writeSkill(path.join(workspace, "skills"), "cwd-skill", {
      name: "cwd-skill",
      description: "Workspace skills folder",
    });

    const discovered = await discoverSkillFiles({ workspace, cwd: workspace, additionalSkillDirs: [path.join(home, "skills")] });

    expect(discovered.slice(0, 3)).toEqual([projectAgentsPath, projectVelairePath, homePath]);
    expect(discovered).toContain(cwdPath);
    expect(discovered.filter((filePath) => filePath === homePath)).toHaveLength(1);
  });

  test("expands tilde skill directories", async () => {
    const workspace = tempDir("velaire-workspace-");
    const relativeHomeDir = `.velaire-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const absoluteHomeDir = path.join(homedir(), relativeHomeDir);
    tempRoots.push(absoluteHomeDir);
    const skillPath = writeSkill(path.join(absoluteHomeDir, "skills"), "tilde-skill", {
      name: "tilde-skill",
      description: "Tilde skill",
    });

    const skills = await loadSkills({ workspace, cwd: workspace, additionalSkillDirs: [`~/${relativeHomeDir}/skills`] });

    expect(skills.map((skill) => skill.path)).toContain(skillPath);
  });
});
