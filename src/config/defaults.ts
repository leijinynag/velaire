import type { VelaireConfig } from "./types";

export const defaultConfig: VelaireConfig = {
  version: 1,
  defaultModel: "claude",
  agent: {
    defaultPreset: "coding",
  },
  models: [],
  settings: {
    permissions: {
      allow: [],
      deny: [],
    },
  },
};
