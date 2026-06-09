import { describe, expect, test } from "bun:test";

import { defaultConfig } from "@/config/defaults";
import { velaireConfigSchema } from "@/config/types";

describe("config schema", () => {
  test("accepts the default config shape", () => {
    expect(velaireConfigSchema.parse(defaultConfig)).toEqual({
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
    });
  });

  test("uses apiKey instead of APIKey", () => {
    const parsed = velaireConfigSchema.parse({
      version: 1,
      defaultModel: "claude",
      agent: { defaultPreset: "coding" },
      models: [
        {
          name: "claude",
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          apiKey: "${ANTHROPIC_API_KEY}",
          baseURL: null,
          options: { maxTokens: 4096 },
        },
      ],
      settings: { permissions: { allow: [], deny: [] } },
    });

    expect(parsed.models[0]?.apiKey).toBe("${ANTHROPIC_API_KEY}");
    expect("APIKey" in parsed.models[0]!).toBe(false);
  });

  test("rejects defaultModel values that do not match configured model names", () => {
    const result = velaireConfigSchema.safeParse({
      ...defaultConfig,
      defaultModel: "missing",
      models: [{ name: "claude", provider: "anthropic", model: "claude", apiKey: "x", baseURL: null }],
    });

    expect(result.success).toBe(false);
  });
});
