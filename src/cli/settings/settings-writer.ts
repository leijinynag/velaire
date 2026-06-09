import { appendToolToAllowList, settingsSchema } from "./settings";
import { SettingsLoader } from "./settings-loader";

export class SettingsWriter {
  constructor(private readonly loader: SettingsLoader = new SettingsLoader()) {}

  async appendAllowedTool(cwd: string, toolName: string): Promise<void> {
    const filePath = this.loader.projectLocalSettingsPath(cwd);
    const file = Bun.file(filePath);
    let base: Record<string, unknown> = {};
    if (await file.exists()) {
      try {
        const data: unknown = await file.json();
        const parsed = settingsSchema.safeParse(data);
        if (parsed.success) base = parsed.data as Record<string, unknown>;
        else if (typeof data === "object" && data !== null && !Array.isArray(data)) base = data as Record<string, unknown>;
      } catch {
        base = {};
      }
    }
    await Bun.write(filePath, JSON.stringify(appendToolToAllowList(base, toolName), null, 2) + "\n");
  }
}
