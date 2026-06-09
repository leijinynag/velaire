import { z } from "zod";

export const settingsSchema = z
  .object({
    permissions: z
      .object({
        allow: z.array(z.string()).optional(),
        deny: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type Settings = z.infer<typeof settingsSchema>;

export function appendToolToAllowList(document: Record<string, unknown>, toolName: string): Record<string, unknown> {
  const permissions = document.permissions && typeof document.permissions === "object" && !Array.isArray(document.permissions)
    ? { ...(document.permissions as Record<string, unknown>) }
    : {};
  const rawAllow = permissions.allow;
  const existing = Array.isArray(rawAllow) ? rawAllow.filter((item): item is string => typeof item === "string") : [];
  const allow = existing.includes(toolName) ? existing : [...existing, toolName];
  return { ...document, permissions: { ...permissions, allow } };
}
