import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { isVelaireSetupComplete } from "@/config/paths";

const originalHome = process.env.VELAIRE_HOME;

async function withTempHome(fn: (home: string) => Promise<void>) {
  const home = await mkdtemp(path.join(tmpdir(), "velaire-setup-complete-"));
  process.env.VELAIRE_HOME = home;
  Bun.env.VELAIRE_HOME = home;
  try {
    await fn(home);
  } finally {
    if (originalHome === undefined) {
      delete process.env.VELAIRE_HOME;
      delete Bun.env.VELAIRE_HOME;
    } else {
      process.env.VELAIRE_HOME = originalHome;
      Bun.env.VELAIRE_HOME = originalHome;
    }
    await rm(home, { recursive: true, force: true });
  }
}

describe("setup completeness", () => {
  test("treats invalid provider/model config as incomplete so first-run wizard can repair it", async () => {
    await withTempHome(async (home) => {
      await writeFile(
        path.join(home, "config.yaml"),
        `version: 1
defaultModel: deepseek-v4-pro
agent:
  defaultPreset: coding
models:
  - name: deepseek-v4-pro
    provider: anthropic
    model: deepseek-v4-pro
    apiKey: invalid
    baseURL: null
    options: {}
settings:
  permissions:
    allow: []
    deny: []
`,
      );

      expect(isVelaireSetupComplete()).toBe(false);
    });
  });
});
