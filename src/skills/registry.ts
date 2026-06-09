import type { Skill } from "./types";

export class SkillRegistry {
  private readonly skills = new Map<string, Skill[]>();

  constructor(skills: Skill[] = []) {
    for (const skill of skills) this.register(skill);
  }

  register(skill: Skill): void {
    const key = skill.name.toLowerCase();
    const existing = this.skills.get(key) ?? [];
    // 同名技能可来自不同目录，保留全部，由调用方按展示顺序选择。
    if (!existing.some((item) => item.path === skill.path)) {
      existing.push(skill);
      this.skills.set(key, existing);
    }
  }

  list(): Skill[] {
    return [...this.skills.values()].flat();
  }

  findByName(name: string): Skill | undefined {
    return this.skills.get(name.toLowerCase())?.[0];
  }
}
