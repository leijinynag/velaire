import { describe, expect, test } from "bun:test";

const projectRoot = new URL("../..", import.meta.url).pathname;

describe("velaire workbench CLI", () => {
  test("lists the workbench command in help output", async () => {
    const proc = Bun.spawn(["bun", "index.ts", "--help"], {
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
    expect(stdout).toContain("workbench");
  });
});
