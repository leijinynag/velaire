import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  getConfigFilePath,
  getDefaultVelaireHome,
  getProjectLocalSettingsPath,
  getProjectSettingsPath,
  getVelaireHomePath,
} from "@/config/paths";

const originalHome = process.env.VELAIRE_HOME;

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.VELAIRE_HOME;
    delete Bun.env.VELAIRE_HOME;
  } else {
    process.env.VELAIRE_HOME = originalHome;
    Bun.env.VELAIRE_HOME = originalHome;
  }
});

describe("config paths", () => {
  test("VELAIRE_HOME overrides default home", () => {
    process.env.VELAIRE_HOME = "/tmp/velaire-home";
    Bun.env.VELAIRE_HOME = "/tmp/velaire-home";

    expect(getVelaireHomePath()).toBe("/tmp/velaire-home");
    expect(getConfigFilePath()).toBe("/tmp/velaire-home/config.yaml");
  });

  test("defaults to ~/.velaire without VELAIRE_HOME", () => {
    delete process.env.VELAIRE_HOME;
    delete Bun.env.VELAIRE_HOME;

    expect(getVelaireHomePath()).toBe(getDefaultVelaireHome());
    expect(getConfigFilePath()).toBe(join(getDefaultVelaireHome(), "config.yaml"));
  });

  test("resolves project settings paths", () => {
    expect(getProjectSettingsPath("/workspace/project")).toBe("/workspace/project/.velaire/settings.json");
    expect(getProjectLocalSettingsPath("/workspace/project")).toBe("/workspace/project/.velaire/settings.local.json");
  });
});
