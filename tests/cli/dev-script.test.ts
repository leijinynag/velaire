import { describe, expect, test } from "bun:test";

const projectRoot = new URL("../..", import.meta.url).pathname;

describe("bun run dev", () => {
  test("runs the Velaire CLI directly", async () => {
    const proc = Bun.spawn(["bun", "run", "dev", "--help"], {
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
    expect(stderr).toContain("$ bun index.ts --help");
    expect(stdout).toContain("Usage: velaire");
  });
});
