import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";
import { ensureAbsolutePath, errorMessage, truncateText } from "@/tools/workspace/utils";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_CHARS = 12_000;

const schema = z.object({
  description: z.string().optional().describe("Explain why you want to execute the command. Place description before command when possible."),
  command: z.string(),
  cwd: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});

async function readPipe(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  return new Response(stream).text();
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may have already exited; callers still wait for stdio to close.
    }
  }
}

export const bashTool: ToolDefinition<z.infer<typeof schema>, { exitCode: number | null; stdout: string; stderr: string; truncated: boolean }> = {
  name: "bash",
  description: "Execute a shell command in bash with cwd, timeout, AbortSignal, separated stdout/stderr, and truncated output. Include a short description explaining why the command is needed.",
  schema,
  capabilities: ["shell.execute"],
  risk: { level: "high", reversible: false, description: "Runs arbitrary shell commands that may modify the system." },
  async execute({ command, cwd, timeout, maxChars }, context) {
    const workingDirectory = cwd ?? context.cwd;
    const absolute = ensureAbsolutePath(workingDirectory);
    if (!absolute.ok) {
      return toolFailure({ summary: "Invalid working directory", modelContent: absolute.message, code: "INVALID_CWD", message: absolute.message, details: { cwd: workingDirectory } });
    }

    let timeoutId: Timer | undefined;
    let timedOut = false;
    let aborted = false;

    try {
      // shell 执行统一在这里绑定 cwd、超时、中断和输出截断。
      const proc = Bun.spawn({ cmd: ["bash", "-lc", command], cwd: workingDirectory, stdout: "pipe", stderr: "pipe", detached: true });
      const kill = () => {
        aborted = true;
        killProcessGroup(proc.pid, "SIGTERM");
      };
      context.signal?.addEventListener("abort", kill, { once: true });
      timeoutId = setTimeout(() => {
        timedOut = true;
        killProcessGroup(proc.pid, "SIGTERM");
      }, timeout ?? DEFAULT_TIMEOUT_MS);

      const [stdoutRaw, stderrRaw, exitCode] = await Promise.all([readPipe(proc.stdout), readPipe(proc.stderr), proc.exited]);
      if (timeoutId) clearTimeout(timeoutId);
      context.signal?.removeEventListener("abort", kill);

      const stdoutLimited = truncateText(stdoutRaw, maxChars ?? DEFAULT_MAX_CHARS);
      const stderrLimited = truncateText(stderrRaw, maxChars ?? DEFAULT_MAX_CHARS);
      const truncated = stdoutLimited.truncated || stderrLimited.truncated;
      const modelContent = `exitCode: ${exitCode}\nstdout:\n${stdoutLimited.text}\nstderr:\n${stderrLimited.text}`;
      const data = { exitCode, stdout: stdoutLimited.text, stderr: stderrLimited.text, truncated };

      if (timedOut) {
        return toolFailure({ summary: "Command timed out", modelContent, code: "COMMAND_TIMEOUT", message: `Command timed out after ${timeout ?? DEFAULT_TIMEOUT_MS}ms.`, details: { command, cwd: workingDirectory }, metadata: { timedOut: true }, });
      }
      if (aborted || context.signal?.aborted) {
        return toolFailure({ summary: "Command aborted", modelContent, code: "COMMAND_ABORTED", message: "Command was aborted.", details: { command, cwd: workingDirectory }, metadata: { aborted: true } });
      }
      if (exitCode !== 0) {
        return { ...toolFailure({ summary: `Command failed with exit code ${exitCode}`, modelContent, code: "COMMAND_FAILED", message: `Command failed with exit code ${exitCode}.`, details: { command, cwd: workingDirectory }, metadata: { exitCode, truncated } }), data };
      }

      return toolSuccess({ summary: "Command completed successfully", modelContent, data, metadata: { exitCode, truncated } });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      const message = errorMessage(error);
      const code = context.signal?.aborted ? "COMMAND_ABORTED" : "COMMAND_EXEC_FAILED";
      return toolFailure({ summary: "Command execution failed", modelContent: message, code, message, details: { command, cwd: workingDirectory } });
    }
  },
};
