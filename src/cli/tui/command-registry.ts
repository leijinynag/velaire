import { loadSkills } from "@/skills/loader";
import type { SkillDiscoveryOptions, SkillFrontmatter } from "@/skills/types";

export interface SlashCommand {
  name: string;
  description: string;
  type: "builtin" | "skill";
}

export interface PromptSubmission {
  text: string;
  requestedSkillName: string | null;
}

export interface BuiltinInvocation {
  name: string;
  args: string;
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear the current conversation history", type: "builtin" },
  { name: "exit", description: "Exit the TUI session", type: "builtin" },
  { name: "help", description: "List available slash commands, or show details for one (`/help <name>`)", type: "builtin" },
  { name: "quit", description: "Exit the TUI session", type: "builtin" },
];

export async function loadAvailableCommands(options: SkillDiscoveryOptions = {}): Promise<SlashCommand[]> {
  const skills = await loadSkills(options);
  const skillCommands = skills.map(toSkillCommand).sort((left, right) => left.name.localeCompare(right.name));
  return dedupeCommands([...BUILTIN_COMMANDS, ...skillCommands]);
}

export function filterCommands(commands: SlashCommand[], filter: string): SlashCommand[] {
  const normalizedFilter = normalizeCommandName(filter);
  if (!normalizedFilter) return commands;
  return commands
    .filter((command) => {
      const name = command.name.toLowerCase();
      const description = command.description.toLowerCase();
      return name.includes(normalizedFilter) || description.includes(normalizedFilter);
    })
    .sort((left, right) => scoreCommandMatch(right, normalizedFilter) - scoreCommandMatch(left, normalizedFilter));
}

export function getSlashQuery(text: string): string | null {
  if (!text.startsWith("/")) return null;
  if (/\s/.test(text)) return null;
  return text.slice(1);
}

export function insertSlashCommand(command: SlashCommand): string {
  return `/${command.name} `;
}

export function getHighlightedCommandName(text: string, commands: SlashCommand[]): string | null {
  const match = text.match(/^\/([^\s]+)\s/);
  if (!match) return null;
  const commandToken = match[1];
  if (!commandToken) return null;
  const commandName = normalizeCommandName(commandToken);
  return commands.some((command) => command.name.toLowerCase() === commandName) ? commandToken : null;
}

export function resolveBuiltinCommand(text: string): BuiltinInvocation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^\/?([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const token = match[1];
  if (!token) return null;
  const normalized = normalizeCommandName(token);
  const builtin = BUILTIN_COMMANDS.find((command) => command.name === normalized);
  if (!builtin) return null;
  return { name: builtin.name, args: (match[2] ?? "").trim() };
}

export function resolveCommand(text: string, commands: SlashCommand[] = BUILTIN_COMMANDS): (BuiltinInvocation & { requestedSkillName?: string }) | null {
  const submission = buildPromptSubmission(text, commands);
  const builtin = resolveBuiltinCommand(text);
  if (builtin) return builtin;
  return submission.requestedSkillName ? { name: submission.requestedSkillName, args: text.replace(/^\/[^\s]+\s?/, ""), requestedSkillName: submission.requestedSkillName } : null;
}

export function formatHelp(commands: SlashCommand[] = BUILTIN_COMMANDS, target?: string): string {
  if (target) {
    const normalized = normalizeCommandName(target);
    const match = commands.find((command) => command.name.toLowerCase() === normalized);
    if (!match) return `Unknown command: \`/${target}\`. Run \`/help\` to see available commands.`;
    const kind = match.type === "builtin" ? "Built-in command" : "Skill";
    return `**/${match.name}** — _${kind}_\n\n${match.description}`;
  }

  const builtins = commands.filter((command) => command.type === "builtin");
  const skills = commands.filter((command) => command.type === "skill");
  const lines: string[] = ["**Available slash commands**", ""];
  if (builtins.length > 0) {
    lines.push("_Built-in_");
    for (const command of builtins) lines.push(`- \`/${command.name}\` — ${command.description}`);
  }
  if (skills.length > 0) {
    if (builtins.length > 0) lines.push("");
    lines.push("_Skills_");
    for (const command of skills) lines.push(`- \`/${command.name}\` — ${command.description}`);
  }
  lines.push("", "Run `/help <name>` for details on a single command.");
  return lines.join("\n");
}

// skill slash command 不改写用户正文，只给 runtime 标记显式技能名。
export function buildPromptSubmission(text: string, commands: SlashCommand[]): PromptSubmission {
  const match = text.match(/^\/([^\s]+)(?:\s|$)/);
  if (!match) return { text, requestedSkillName: null };
  const commandToken = match[1];
  if (!commandToken) return { text, requestedSkillName: null };
  const requestedSkill = commands.find(
    (command) => command.type === "skill" && command.name.toLowerCase() === normalizeCommandName(commandToken),
  );
  return { text, requestedSkillName: requestedSkill?.name ?? null };
}

function toSkillCommand(skill: SkillFrontmatter): SlashCommand {
  return { name: skill.name, description: skill.description, type: "skill" };
}

function dedupeCommands(commands: SlashCommand[]): SlashCommand[] {
  const seen = new Set<string>();
  const deduped: SlashCommand[] = [];
  for (const command of commands) {
    const key = command.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(command);
  }
  return deduped;
}

function normalizeCommandName(value: string): string {
  return value.replace(/^\//, "").trim().toLowerCase();
}

function scoreCommandMatch(command: SlashCommand, filter: string): number {
  const name = command.name.toLowerCase();
  const description = command.description.toLowerCase();
  if (name.startsWith(filter)) return 3;
  if (name.includes(filter)) return 2;
  if (description.includes(filter)) return 1;
  return 0;
}
