import { existsSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import matter from "gray-matter";

import { getVelaireHomePath } from "@/config/paths";

import type { Skill, SkillDiscoveryOptions, SkillFrontmatter } from "./types";

export function expandHome(inputPath: string): string {
  if (inputPath === "~") return homedir();
  if (inputPath.startsWith("~/")) return path.join(homedir(), inputPath.slice(2));
  return inputPath;
}

export function getDefaultSkillDirs(options: SkillDiscoveryOptions = {}): string[] {
  const workspace = path.resolve(expandHome(options.workspace ?? options.cwd ?? process.cwd()));
  const cwd = path.resolve(expandHome(options.cwd ?? workspace));

  return [
    path.join(workspace, ".agents", "skills"),
    path.join(workspace, ".velaire", "skills"),
    path.join(getVelaireHomePath(), "skills"),
    "~/.agents/skills",
    "~/.velaire/skills",
    path.join(cwd, "skills"),
    ...(options.additionalSkillDirs ?? []),
  ];
}

async function canonicalPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

async function skillFilesInDir(skillsDir: string): Promise<string[]> {
  const expanded = path.resolve(expandHome(skillsDir));
  if (!existsSync(expanded)) return [];

  try {
    const entries = await readdir(expanded, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(expanded, entry.name, "SKILL.md"));
  } catch {
    return [];
  }
}

export async function discoverSkillFiles(options: SkillDiscoveryOptions = {}): Promise<string[]> {
  const skillFiles: string[] = [];
  const seen = new Set<string>();

  for (const skillsDir of getDefaultSkillDirs(options)) {
    for (const skillFile of await skillFilesInDir(skillsDir)) {
      if (!existsSync(skillFile)) continue;
      // 同一路径可能经由默认目录和显式目录重复出现，只按最终文件路径去重，不按 name 覆盖。
      const key = await canonicalPath(skillFile);
      if (seen.has(key)) continue;
      seen.add(key);
      skillFiles.push(skillFile);
    }
  }

  return skillFiles;
}

function requireStringField(data: Record<string, unknown>, field: "name" | "description", filePath: string): string {
  const value = data[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Skill frontmatter in ${filePath} must include a non-empty ${field}`);
  }
  return value;
}

export async function loadSkill(filePath: string): Promise<Skill> {
  const pathToRead = path.resolve(expandHome(filePath));
  const file = Bun.file(pathToRead);
  if (!(await file.exists())) {
    throw new Error(`Skill file ${pathToRead} does not exist`);
  }

  const parsed = matter(await file.text());
  const data = parsed.data as Record<string, unknown>;
  const name = requireStringField(data, "name", pathToRead);
  const description = requireStringField(data, "description", pathToRead);

  return {
    ...data,
    name,
    description,
    path: pathToRead,
    content: parsed.content,
  } as Skill;
}

export async function loadSkillFrontmatter(filePath: string): Promise<SkillFrontmatter> {
  const skill = await loadSkill(filePath);
  const { content: _content, ...frontmatter } = skill;
  return frontmatter;
}

export async function loadSkills(options: SkillDiscoveryOptions = {}): Promise<Skill[]> {
  const files = await discoverSkillFiles(options);
  return Promise.all(files.map((file) => loadSkill(file)));
}
