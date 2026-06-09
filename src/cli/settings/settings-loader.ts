import { homedir } from "node:os";
import { join } from "node:path";

import { getDefaultVelaireHome } from "@/config/paths";

import { settingsSchema, type Settings } from "./settings";

async function readJsonFile(filePath: string): Promise<unknown | undefined> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return undefined;
  try {
    return await file.json();
  } catch {
    console.warn(`[velaire] Could not read ${filePath}; skipping settings layer.`);
    return undefined;
  }
}

async function loadLayer(filePath: string): Promise<Settings> {
  const data = await readJsonFile(filePath);
  if (data === undefined) return {};
  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[velaire] Invalid settings at ${filePath}; ignoring layer.`);
    return {};
  }
  return parsed.data;
}

function mergeSettingsLayers(layers: Settings[]): Settings {
  const mergedTop: Record<string, unknown> = {};
  for (const layer of layers) {
    const record = layer as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== "permissions") mergedTop[key] = record[key];
    }
  }

  const allow = new Set<string>();
  const deny = new Set<string>();
  const permissionRest: Record<string, unknown> = {};
  for (const layer of layers) {
    const permissions = layer.permissions;
    if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) continue;
    const record = permissions as Record<string, unknown>;
    for (const item of Array.isArray(record.allow) ? record.allow : []) if (typeof item === "string") allow.add(item);
    for (const item of Array.isArray(record.deny) ? record.deny : []) if (typeof item === "string") deny.add(item);
    for (const [key, value] of Object.entries(record)) {
      if (key !== "allow" && key !== "deny") permissionRest[key] = value;
    }
  }

  const permissions: Record<string, unknown> = { ...permissionRest };
  if (allow.size > 0) permissions.allow = [...allow];
  if (deny.size > 0) permissions.deny = [...deny];
  return Object.keys(permissions).length > 0 ? { ...mergedTop, permissions } : mergedTop;
}

export class SettingsLoader {
  constructor(private readonly velaireHome: string = getDefaultVelaireHome()) {}

  userSettingsPath(): string {
    return join(this.velaireHome, "settings.json");
  }

  projectSettingsPath(cwd: string): string {
    return join(cwd, ".velaire", "settings.json");
  }

  projectLocalSettingsPath(cwd: string): string {
    return join(cwd, ".velaire", "settings.local.json");
  }

  async load(cwd: string): Promise<Settings> {
    return mergeSettingsLayers(await Promise.all([this.userSettingsPath(), this.projectSettingsPath(cwd), this.projectLocalSettingsPath(cwd)].map((filePath) => loadLayer(filePath))));
  }

  async loadAllowList(cwd: string): Promise<Set<string>> {
    const settings = await this.load(cwd);
    return new Set(Array.isArray(settings.permissions?.allow) ? settings.permissions.allow : []);
  }
}

export function expandSettingsHome(filePath: string): string {
  return filePath.startsWith("~/") ? join(homedir(), filePath.slice(2)) : filePath;
}
