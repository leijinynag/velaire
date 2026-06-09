import { describe, expect, test } from "bun:test";

import { BUILTIN_COMMANDS, formatHelp, resolveBuiltinCommand } from "@/cli/tui/command-registry";

describe("TUI slash command registry", () => {
  test("includes clear help exit and quit builtins", () => {
    expect(BUILTIN_COMMANDS.map((command) => command.name)).toEqual(["clear", "exit", "help", "quit"]);
  });

  test("resolves builtin slash commands with arguments", () => {
    expect(resolveBuiltinCommand("/help clear")).toEqual({ name: "help", args: "clear" });
    expect(resolveBuiltinCommand("/clear")).toEqual({ name: "clear", args: "" });
    expect(resolveBuiltinCommand("/exit")).toEqual({ name: "exit", args: "" });
    expect(resolveBuiltinCommand("/quit")).toEqual({ name: "quit", args: "" });
  });

  test("formats concise command help", () => {
    const help = formatHelp(BUILTIN_COMMANDS);

    expect(help).toContain("/clear");
    expect(help).toContain("/help");
    expect(help).toContain("/exit");
    expect(help).toContain("/quit");
  });
});
