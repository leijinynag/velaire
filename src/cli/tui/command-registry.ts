import { loadSkills } from "@/skills/loader";
import type { SkillDiscoveryOptions } from "@/skills/types";

export interface SlashCommand {
  name: string;
  description: string;
  kind: "builtin" | "skill";
}

export interface CommandInvocation {
  name: string;
  args: string;
  requestedSkillName?: string;
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear the current TUI session", kind: "builtin" },
  { name: "help", description: "Show available slash commands", kind: "builtin" },
  { name: "exit", description: "Exit the TUI session", kind: "builtin" },
  { name: "quit", description: "Exit the TUI session", kind: "builtin" },
];

export async function loadAvailableCommands(options: SkillDiscoveryOptions = {}): Promise<SlashCommand[]> {
  const skills = await loadSkills(options);
  const skillCommands = skills.map((skill): SlashCommand => ({
    name: skill.name,
    description: skill.description,
    kind: "skill",
  }));
  return [...BUILTIN_COMMANDS, ...skillCommands];
}

export function resolveCommand(text: string, commands: SlashCommand[] = BUILTIN_COMMANDS): CommandInvocation | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const name = normalizeCommandName(match[1] ?? "");
  const command = commands.find((candidate) => candidate.name === name);
  if (!command) return null;

  return {
    name,
    args: (match[2] ?? "").trim(),
    ...(command.kind === "skill" ? { requestedSkillName: name } : {}),
  };
}

export function resolveBuiltinCommand(text: string): CommandInvocation | null {
  const invocation = resolveCommand(text, BUILTIN_COMMANDS);
  return invocation && BUILTIN_COMMANDS.some((command) => command.name === invocation.name) ? invocation : null;
}

export function formatHelp(commands: SlashCommand[] = BUILTIN_COMMANDS): string {
  return ["Available slash commands", ...commands.map((command) => `/${command.name} — ${command.description}`)].join("\n");
}

function normalizeCommandName(value: string): string {
  return value.replace(/^\//, "").trim().toLowerCase();
}
