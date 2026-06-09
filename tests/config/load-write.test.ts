import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig } from "@/config/load";
import { getConfigFilePath } from "@/config/paths";
import { saveConfig } from "@/config/write";

const originalHome = process.env.VELAIRE_HOME;
const tempDirs: string[] = [];

function useTempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "velaire-config-"));
  tempDirs.push(home);
  process.env.VELAIRE_HOME = home;
  Bun.env.VELAIRE_HOME = home;
  return home;
}

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.VELAIRE_HOME;
    delete Bun.env.VELAIRE_HOME;
  } else {
    process.env.VELAIRE_HOME = originalHome;
    Bun.env.VELAIRE_HOME = originalHome;
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("config load and write", () => {
  test("loads defaults when config file does not exist", () => {
    useTempHome();

    expect(loadConfig()).toMatchObject({
      version: 1,
      defaultModel: "claude",
      agent: { defaultPreset: "coding" },
      models: [],
    });
  });

  test("writes validated YAML and loads it back", () => {
    useTempHome();

    saveConfig({
      version: 1,
      defaultModel: "claude",
      agent: { defaultPreset: "coding" },
      models: [{ name: "claude", provider: "anthropic", model: "claude-sonnet-4-6", apiKey: "key", baseURL: null }],
      settings: { permissions: { allow: ["read_file"], deny: [] } },
    });

    expect(Bun.file(getConfigFilePath()).exists()).resolves.toBe(true);
    expect(loadConfig().models[0]?.apiKey).toBe("key");
  });
});
