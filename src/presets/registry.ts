import type { AsyncAgentPreset } from "./types";

export class PresetRegistry {
  private readonly presets = new Map<string, AsyncAgentPreset>();

  register(preset: AsyncAgentPreset): void {
    this.presets.set(preset.name, preset);
  }

  get(name: string): AsyncAgentPreset {
    const preset = this.presets.get(name);
    if (!preset) throw new Error(`Unsupported preset: ${name}. Available: ${[...this.presets.keys()].join(", ")}`);
    return preset;
  }

  list(): { name: string; description: string }[] {
    return [...this.presets.values()].map(({ name, description }) => ({ name, description }));
  }

  has(name: string): boolean {
    return this.presets.has(name);
  }
}
