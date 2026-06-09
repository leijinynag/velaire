import { describe, expect, test } from "bun:test";

const projectRoot = new URL("../..", import.meta.url).pathname;

describe("velaire CLI run", () => {
  test("prints deterministic mock assistant output for research-lite", async () => {
    const proc = Bun.spawn(["bun", "index.ts", "run", "--provider", "mock", "--preset", "research-lite", "--prompt", "hello"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("Mock response\n");
  });
});
