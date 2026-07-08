import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createCodingTools, createTodoSystem, createTodoWriteTool, createAskUserQuestionTool } from "@/tools/coding";
import type { ToolDefinition } from "@/tools/types";
import { ensureWithinDirectory, isWithinDirectory } from "@/tools/workspace/utils";

let workspace: string;

type BashResultData = { exitCode: number | null; stdout: string; stderr: string; truncated: boolean };

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "velaire-coding-tools-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function getTool(name: string): ToolDefinition<Record<string, unknown>> {
  const tool = createCodingTools().find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool as ToolDefinition<Record<string, unknown>>;
}

async function execute(name: string, input: Record<string, unknown>, options?: { signal?: AbortSignal }) {
  return getTool(name).execute(input, { cwd: workspace, signal: options?.signal });
}

describe("coding tool registry", () => {
  test("exports all required coding tools with normalized contract metadata", () => {
    const tools = createCodingTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "apply_patch",
      "ask_user_question",
      "bash",
      "file_info",
      "glob_search",
      "grep_search",
      "list_files",
      "mkdir",
      "move_path",
      "read_file",
      "str_replace",
      "todo_write",
      "write_file",
    ]);
    expect(getTool("read_file")).toMatchObject({ capabilities: ["workspace.read"], risk: { level: "low" } });
    expect(getTool("write_file")).toMatchObject({ capabilities: ["workspace.write"], risk: { level: "medium" } });
    expect(getTool("apply_patch").capabilities).toContain("destructive");
    expect(getTool("bash")).toMatchObject({ capabilities: ["shell.execute"], risk: { level: "high" } });
    const bashInput = getTool("bash").schema.safeParse({ description: "List files", command: "ls" });
    expect(bashInput.success ? bashInput.data.description : undefined).toBe("List files");
    expect(getTool("ask_user_question")).toMatchObject({ capabilities: ["user.interaction"], risk: { level: "low" } });
  });
});

describe("workspace tools", () => {
  test("workspace path helpers validate directory containment without prefix bypasses", () => {
    const root = resolve(workspace, "root");
    expect(isWithinDirectory(root, root)).toBe(true);
    expect(isWithinDirectory(root, resolve(root, "child", "file.ts"))).toBe(true);
    expect(isWithinDirectory(root, resolve(root, "..", "escape.ts"))).toBe(false);
    expect(isWithinDirectory(root, `${root}2/file.ts`)).toBe(false);
    expect(ensureWithinDirectory(root, resolve(root, "child.ts"))).toEqual({ ok: true });
    expect(ensureWithinDirectory(root, resolve(root, "..", "escape.ts"))).toMatchObject({ ok: false });
  });

  test("read_file reads selected lines and rejects invalid ranges", async () => {
    const filePath = join(workspace, "example.txt");
    await writeFile(filePath, "alpha\nbeta\ngamma");

    await expect(execute("read_file", { path: filePath, startLine: 2, endLine: 3 })).resolves.toMatchObject({
      ok: true,
      data: { path: filePath, startLine: 2, endLine: 3, totalLines: 3, truncated: false },
      modelContent: "2: beta\n3: gamma",
    });
    await expect(execute("read_file", { path: filePath, startLine: 3, endLine: 2 })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_RANGE" },
    });
  });

  test("write_file creates parents and write_file reports absolute-path validation failures", async () => {
    const filePath = join(workspace, "nested", "created.txt");

    await expect(execute("write_file", { path: filePath, content: "created" })).resolves.toMatchObject({
      ok: true,
      data: { path: filePath, bytes: 7, fileChanges: [{ path: filePath, kind: "created", after: "created" }] },
    });
    expect(await readFile(filePath, "utf8")).toBe("created");
    await expect(execute("write_file", { path: "relative.txt", content: "nope" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_PATH" },
    });
  });

  test("str_replace enforces unique replacement by default and can replace all", async () => {
    const filePath = join(workspace, "replace.txt");
    await writeFile(filePath, "one two two");

    await expect(execute("str_replace", { path: filePath, old: "two", new: "three" })).resolves.toMatchObject({
      ok: false,
      error: { code: "OLD_NOT_UNIQUE" },
    });
    await expect(execute("str_replace", { path: filePath, old: "two", new: "three", replaceAll: true })).resolves.toMatchObject({
      ok: true,
      data: { replacements: 2, changed: true, fileChanges: [{ path: filePath, kind: "modified", before: "one two two", after: "one three three" }] },
    });
    expect(await readFile(filePath, "utf8")).toBe("one three three");
  });

  test("list_files, glob_search, grep_search, and file_info return normalized metadata", async () => {
    await writeFile(join(workspace, "a.ts"), "export const needle = 1;\n");
    await writeFile(join(workspace, "b.txt"), "no match\n");

    await expect(execute("list_files", { path: workspace, recursive: false })).resolves.toMatchObject({
      ok: true,
      data: { totalEntries: 2, entries: ["a.ts", "b.txt"] },
    });
    await expect(execute("glob_search", { path: workspace, pattern: "*.ts" })).resolves.toMatchObject({
      ok: true,
      data: { matches: [join(workspace, "a.ts")], matchCount: 1 },
    });
    await expect(execute("grep_search", { path: workspace, pattern: "needle" })).resolves.toMatchObject({
      ok: true,
      data: { totalMatches: 1 },
    });
    await expect(execute("file_info", { path: join(workspace, "a.ts") })).resolves.toMatchObject({
      ok: true,
      data: { path: join(workspace, "a.ts"), kind: "file" },
    });
  });

  test("mkdir, move_path, and apply_patch modify workspace paths", async () => {
    const dirPath = join(workspace, "new-dir");
    const sourcePath = join(dirPath, "source.txt");
    const targetPath = join(workspace, "target.txt");

    await expect(execute("mkdir", { path: dirPath })).resolves.toMatchObject({ ok: true, data: { path: dirPath } });
    await writeFile(sourcePath, "before\n");
    await expect(execute("move_path", { from: sourcePath, to: targetPath })).resolves.toMatchObject({
      ok: true,
      data: { from: sourcePath, to: targetPath, fileChanges: [{ path: targetPath, previousPath: sourcePath, kind: "moved" }] },
    });
    const patch = `--- ${targetPath}\n+++ ${targetPath}\n@@ -1,1 +1,1 @@\n-before\n+after`;
    await expect(execute("apply_patch", { patch })).resolves.toMatchObject({
      ok: true,
      data: { changedFiles: [targetPath], fileCount: 1, fileChanges: [{ path: targetPath, kind: "modified", before: "before\n", after: "after\n" }] },
    });
    expect(await readFile(targetPath, "utf8")).toBe("after\n");
  });
});

describe("shell tool", () => {
  test("bash separates stdout and stderr, keeps exitCode, honors cwd, and truncates output", async () => {
    const result = await execute("bash", {
      command: "pwd; printf 'err' >&2; printf '%160s' '' | tr ' ' x",
      cwd: workspace,
      maxChars: 90,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { exitCode: 0, stderr: "err", truncated: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected bash command to succeed");
    const data = result.data as BashResultData;
    expect(data.stdout).toContain("/");
    expect(data.stdout).toContain("[truncated");
    expect(result.modelContent).toContain("stdout:");
    expect(result.modelContent.length).toBeLessThan(300);
  });

  test("bash returns failure for non-zero exit and supports AbortSignal", async () => {
    await expect(execute("bash", { command: "printf boom >&2; exit 7" })).resolves.toMatchObject({
      ok: false,
      error: { code: "COMMAND_FAILED" },
      data: { exitCode: 7, stderr: "boom" },
    });

    const controller = new AbortController();
    const promise = execute("bash", { command: "sleep 5" }, { signal: controller.signal });
    controller.abort();
    await expect(promise).resolves.toMatchObject({ ok: false, error: { code: "COMMAND_ABORTED" } });
  });

  test("bash timeout kills background children holding stdio open", async () => {
    const result = await execute("bash", {
      command: "node -e \"setInterval(() => {}, 1000)\" & printf ready",
      timeout: 200,
      maxChars: 200,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "COMMAND_TIMEOUT" },
    });
    expect(result.modelContent).toContain("ready");
  });

  test("bash executes commands with bash instead of zsh", async () => {
    const result = await execute("bash", { command: "test -n \"$BASH_VERSION\" && printf '%s' \"$BASH_VERSION\"" });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected bash command to succeed");
    const data = result.data as BashResultData;
    expect(data.stdout).not.toBe("");
  });
});

describe("todo and user-interaction tools", () => {
  test("todo_write replaces and merges todos in memory", async () => {
    const tool = createTodoWriteTool();

    await expect(
      tool.execute({ todos: [{ id: "1", content: "first", status: "pending" }], merge: false }, { cwd: workspace }),
    ).resolves.toMatchObject({ ok: true, data: { todos: [{ id: "1", content: "first", status: "pending" }] } });
    await expect(
      tool.execute({ todos: [{ id: "1", content: "first", status: "completed" }], merge: true }, { cwd: workspace }),
    ).resolves.toMatchObject({ ok: true, data: { counts: { completed: 1 } } });
  });

  test("todo reminder follows Helixent threshold, throttle, and reset behavior", async () => {
    const { middleware, tool } = createTodoSystem();
    const transcript = { messages: [] };
    const agentContext = { messages: [], systemPrompt: "system" };
    const modelContext = () => ({ systemPrompt: "system", messages: [] });
    const todoWriteUse = { type: "tool_use" as const, id: "toolu_0", name: "todo_write", input: {} };

    const emptyContext = modelContext();
    await middleware.beforeModel?.({ transcript, modelContext: emptyContext, agentContext });
    expect(emptyContext.systemPrompt).toBe("system");

    await tool.execute({ todos: [{ id: "1", content: "plan work", status: "pending" }], merge: false }, { cwd: workspace });
    await middleware.afterToolUse?.({ toolUse: todoWriteUse, toolResult: { ok: true, summary: "ok", modelContent: "ok" }, agentContext });
    for (let i = 0; i < 9; i++) {
      const context = modelContext();
      await middleware.beforeModel?.({ transcript, modelContext: context, agentContext });
      expect(context.systemPrompt).not.toContain("<todo_reminder>");
    }

    const thresholdContext = modelContext();
    await middleware.beforeModel?.({ transcript, modelContext: thresholdContext, agentContext });
    expect(thresholdContext.systemPrompt).toContain("<todo_reminder>");
    expect(thresholdContext.systemPrompt).toContain("plan work");

    for (let i = 0; i < 9; i++) {
      const context = modelContext();
      await middleware.beforeModel?.({ transcript, modelContext: context, agentContext });
      expect(context.systemPrompt).not.toContain("<todo_reminder>");
    }

    const throttledContext = modelContext();
    await middleware.beforeModel?.({ transcript, modelContext: throttledContext, agentContext });
    expect(throttledContext.systemPrompt).toContain("<todo_reminder>");

    await middleware.afterToolUse?.({ toolUse: todoWriteUse, toolResult: { ok: true, summary: "ok", modelContent: "ok" }, agentContext });
    for (let i = 0; i < 9; i++) {
      const context = modelContext();
      await middleware.beforeModel?.({ transcript, modelContext: context, agentContext });
      expect(context.systemPrompt).not.toContain("<todo_reminder>");
    }
  });

  test("ask_user_question validates callback answers", async () => {
    const tool = createAskUserQuestionTool(async () => ({ answers: [{ question_index: 0, selected_labels: ["Yes"] }] }));

    await expect(
      tool.execute(
        {
          questions: [
            {
              question: "Proceed?",
              header: "Proceed",
              options: [
                { label: "Yes", description: "Continue" },
                { label: "No", description: "Stop" },
              ],
              multi_select: false,
            },
          ],
        },
        { cwd: workspace },
      ),
    ).resolves.toMatchObject({ ok: true, data: { answers: [{ question_index: 0, selected_labels: ["Yes"] }] } });

    const badTool = createAskUserQuestionTool(async () => ({ answers: [{ question_index: 0, selected_labels: ["Maybe"] }] }));
    await expect(
      badTool.execute(
        {
          questions: [
            {
              question: "Proceed?",
              header: "Proceed",
              options: [
                { label: "Yes", description: "Continue" },
                { label: "No", description: "Stop" },
              ],
              multi_select: false,
            },
          ],
        },
        { cwd: workspace },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_USER_ANSWER" } });
  });
});
