import type { AgentMiddleware } from "@/runtime/middleware";

import { loadSkills } from "./loader";
import { SkillRegistry } from "./registry";
import type { Skill, SkillsMiddlewareOptions } from "./types";

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderSkillsPromptBlock(skills: Skill[], requestedSkillName?: string): string {
  if (skills.length === 0 && !requestedSkillName) return "";

  const registry = new SkillRegistry(skills);
  const requestedSkill = requestedSkillName ? registry.findByName(requestedSkillName) : undefined;
  const skillsXml = skills
    .map((skill) => `<skill name="${escapeAttribute(skill.name)}" path="${escapeAttribute(skill.path)}">\n${skill.description}\n</skill>`)
    .join("\n");

  return `
<velaire_skills>
<instructions>
You have access to Velaire skills: Markdown files that describe task-specific workflows.
When the user request matches a skill, read the SKILL.md file at the path attribute before answering.
Load only the skill file first; read adjacent referenced files only when needed.
</instructions>
${
  requestedSkillName
    ? `<explicit_skill_invocation>
The user explicitly requested skill "${requestedSkillName}".${
        requestedSkill ? ` Read the matching skill file at "${requestedSkill.path}" before answering.` : " No discovered skill matched that name."
      }
</explicit_skill_invocation>
`
    : ""
}<skills>
${skillsXml}
</skills>
</velaire_skills>`;
}

export function createSkillsMiddleware(options: SkillsMiddlewareOptions = {}): AgentMiddleware {
  return {
    beforeModel: async ({ modelContext }) => {
      const skills = await loadSkills(options);
      const skillsBlock = renderSkillsPromptBlock(skills, options.requestedSkillName);
      if (!skillsBlock) return;
      // ProviderInvokeParams 以对象传递给 provider，middleware 直接补充 systemPrompt 即可被后续模型调用消费。
      modelContext.systemPrompt = `${modelContext.systemPrompt}\n\n${skillsBlock}`;
    },
  };
}
