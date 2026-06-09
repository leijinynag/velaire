import { z } from "zod";

export const modelProviderSchema = z.enum(["anthropic", "openai-compatible"]);

export const modelEntrySchema = z.object({
  name: z.string().min(1),
  provider: modelProviderSchema,
  model: z.string().min(1),
  apiKey: z.string().min(1),
  baseURL: z.string().min(1).nullable().default(null),
  options: z.record(z.string(), z.unknown()).optional().default({}),
});

export const settingsSchema = z.object({
  permissions: z
    .object({
      allow: z.array(z.string()).default([]),
      deny: z.array(z.string()).default([]),
    })
    .default({ allow: [], deny: [] }),
});

export const velaireConfigSchema = z
  .object({
    version: z.literal(1),
    defaultModel: z.string().min(1),
    agent: z
      .object({
        defaultPreset: z.string().min(1).default("coding"),
      })
      .default({ defaultPreset: "coding" }),
    models: z.array(modelEntrySchema).default([]),
    settings: settingsSchema.default({ permissions: { allow: [], deny: [] } }),
  })
  .superRefine((value, ctx) => {
    if (value.models.length > 0 && !value.models.some((model) => model.name === value.defaultModel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `defaultModel "${value.defaultModel}" does not match any configured model name`,
        path: ["defaultModel"],
      });
    }
  });

export type ModelProviderName = z.infer<typeof modelProviderSchema>;
export type ModelEntry = z.infer<typeof modelEntrySchema>;
export type VelaireSettings = z.infer<typeof settingsSchema>;
export type VelaireConfig = z.infer<typeof velaireConfigSchema>;
export type VelaireConfigInput = z.input<typeof velaireConfigSchema>;
