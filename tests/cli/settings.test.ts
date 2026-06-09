import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { SettingsLoader } from "@/cli/settings/settings-loader";
import { SettingsWriter } from "@/cli/settings/settings-writer";

const roots: string[] = [];
function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "velaire-settings-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("settings loader and writer", () => {
  test("merges user project and local allow lists", async () => {
    const home = tempDir();
    const cwd = tempDir();
    const loader = new SettingsLoader(home);
    mkdirSync(path.dirname(loader.userSettingsPath()), { recursive: true });
    mkdirSync(path.dirname(loader.projectSettingsPath(cwd)), { recursive: true });
    mkdirSync(path.dirname(loader.projectLocalSettingsPath(cwd)), { recursive: true });
    writeFileSync(loader.userSettingsPath(), JSON.stringify({ permissions: { allow: ["read_file"] } }));
    writeFileSync(loader.projectSettingsPath(cwd), JSON.stringify({ permissions: { allow: ["grep_search"] } }));
    writeFileSync(loader.projectLocalSettingsPath(cwd), JSON.stringify({ permissions: { allow: ["bash"] } }));

    await expect(loader.loadAllowList(cwd)).resolves.toEqual(new Set(["read_file", "grep_search", "bash"]));
  });

  test("appendAllowedTool preserves unknown local settings fields", async () => {
    const home = tempDir();
    const cwd = tempDir();
    const loader = new SettingsLoader(home);
    const writer = new SettingsWriter(loader);
    mkdirSync(path.dirname(loader.projectLocalSettingsPath(cwd)), { recursive: true });
    writeFileSync(loader.projectLocalSettingsPath(cwd), JSON.stringify({ custom: true, permissions: { allow: ["read_file"], other: "keep" } }));

    await writer.appendAllowedTool(cwd, "bash");

    const next = JSON.parse(readFileSync(loader.projectLocalSettingsPath(cwd), "utf8"));
    expect(next).toEqual({ custom: true, permissions: { allow: ["read_file", "bash"], other: "keep" } });
  });
});
