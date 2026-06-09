export interface SlashCommand {
  name: "clear" | "help" | "exit" | "quit";
  description: string;
}

export interface BuiltinInvocation {
  name: SlashCommand["name"];
  args: string;
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear the current TUI session" },
  { name: "help", description: "Show available slash commands" },
  { name: "exit", description: "Exit the TUI session" },
  { name: "quit", description: "Exit the TUI session" },
];

export function resolveBuiltinCommand(text: string): BuiltinInvocation | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const name = normalizeCommandName(match[1] ?? "");
  if (!isBuiltinCommandName(name)) return null;

  return { name, args: (match[2] ?? "").trim() };
}

export function formatHelp(commands: SlashCommand[] = BUILTIN_COMMANDS): string {
  return [
    "Available slash commands",
    ...commands.map((command) => `/${command.name} — ${command.description}`),
  ].join("\n");
}

function normalizeCommandName(value: string): string {
  return value.replace(/^\//, "").trim().toLowerCase();
}

function isBuiltinCommandName(value: string): value is SlashCommand["name"] {
  return BUILTIN_COMMANDS.some((command) => command.name === value);
}
