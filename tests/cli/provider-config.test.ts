import { describe, expect, test } from "bun:test";

import { createProviderFromModelEntry, resolveRunConfiguration } from "@/cli/index";

describe("CLI provider configuration", () => {
  test("creates configured Anthropic and OpenAI-compatible providers", () => {
    expect(
      createProviderFromModelEntry({
        name: "claude",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        apiKey: "test-key",
        baseURL: null,
        options: {},
      }).name,
    ).toBe("anthropic");

    expect(
      createProviderFromModelEntry({
        name: "openai",
        provider: "openai-compatible",
        model: "gpt-test",
        apiKey: "test-key",
        baseURL: "https://example.test/v1",
        options: {},
      }).name,
    ).toBe("openai-compatible");
  });

  test("resolves default model and preset from config when run options omit provider and preset", () => {
    const resolved = resolveRunConfiguration(
      {},
      {
        version: 1,
        defaultModel: "claude",
        agent: { defaultPreset: "coding" },
        models: [{ name: "claude", provider: "anthropic", model: "claude-sonnet-4-6", apiKey: "key", baseURL: null, options: {} }],
        settings: { permissions: { allow: ["read_file"], deny: [] } },
      },
    );

    expect(resolved.presetName).toBe("coding");
    expect(resolved.modelEntry?.name).toBe("claude");
    expect(resolved.policyProfile).toEqual({ allow: ["read_file"], deny: [] });
  });
});
