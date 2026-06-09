import type { AgentMiddleware } from "@/runtime/middleware";

import { discoverSkillFiles, loadSkillFrontmatter } from "./loader";
import { SkillRegistry } from "./registry";
import type { Skill, SkillFrontmatter, SkillsMiddlewareOptions } from "./types";

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderSkillsPromptBlock(skills: SkillFrontmatter[], requestedSkillName?: string): string {
  if (skills.length === 0 && !requestedSkillName) return "";

  const registry = new SkillRegistry(skills as Skill[]);
  const requestedSkill = requestedSkillName ? registry.findByName(requestedSkillName) : undefined;
  const skillsXml = skills
    .map((skill) => `<skill name="${escapeAttribute(skill.name)}" path="${escapeAttribute(skill.path)}">\n${skill.description}\n</skill>`)
    .join("\n");

  return `
<skill_system>
<instructions>
You have access to skills that provide optimized workflows for specific tasks. Each skill contains best practices, frameworks, and references to additional resources.

**Progressive Loading Pattern:**
1. When a user query matches a skill's use case, immediately call \`read_file\` on the skill's main file using the path attribute provided in the skill tag below
2. If an explicit requested skill is provided in the system context, load that skill first even if the user message is short
3. Read and understand the skill's workflow and instructions
4. The skill file contains references to external resources under the same folder
5. Load referenced resources only when needed during execution
6. Follow the skill's instructions precisely
</instructions>
${
  requestedSkillName
    ? `<explicit_skill_invocation>
The user explicitly selected the skill "${requestedSkillName}" from the slash command picker.${
        requestedSkill ? `\nYou must read the matching skill file at "${requestedSkill.path}" before answering.` : "\nNo discovered skill matched that name."
      }
</explicit_skill_invocation>
`
    : ""
}<skills>
${skillsXml}
</skills>
</skill_system>`;
}

export function createSkillsMiddleware(options: SkillsMiddlewareOptions = {}): AgentMiddleware {
  return {
    beforeAgentRun: async ({ agentContext }) => {
      const files = await discoverSkillFiles(options);
      agentContext.skills = await Promise.all(files.map((file) => loadSkillFrontmatter(file)));
    },
    beforeModel: ({ modelContext, agentContext }) => {
      const skills = Array.isArray(agentContext.skills) ? (agentContext.skills as SkillFrontmatter[]) : [];
      const skillsBlock = renderSkillsPromptBlock(skills, agentContext.requestedSkillName ?? options.requestedSkillName);
      if (!skillsBlock) return;
      modelContext.systemPrompt = `${modelContext.systemPrompt}\n\n${skillsBlock}`;
    },
  };
}
