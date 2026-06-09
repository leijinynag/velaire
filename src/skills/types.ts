export interface SkillFrontmatter {
  name: string;
  description: string;
  path: string;
  [key: string]: unknown;
}

export interface Skill extends SkillFrontmatter {
  content: string;
}

export interface SkillDiscoveryOptions {
  workspace?: string;
  cwd?: string;
  additionalSkillDirs?: string[];
}

export interface SkillsMiddlewareOptions extends SkillDiscoveryOptions {
  requestedSkillName?: string;
}
