export type CodingInteractionMode = "normal" | "plan" | "multi-agent";

export const CODING_INTERACTION_MODES: CodingInteractionMode[] = ["normal", "plan", "multi-agent"];

export function nextCodingInteractionMode(mode: CodingInteractionMode): CodingInteractionMode {
  const index = CODING_INTERACTION_MODES.indexOf(mode);
  return CODING_INTERACTION_MODES[(index + 1) % CODING_INTERACTION_MODES.length] ?? "normal";
}

export function modeLabel(mode: CodingInteractionMode): string {
  switch (mode) {
    case "plan":
      return "plan";
    case "multi-agent":
      return "multi-agent";
    case "normal":
    default:
      return "normal";
  }
}

export function modeGlyph(mode: CodingInteractionMode): string {
  switch (mode) {
    case "plan":
      return "◇";
    case "multi-agent":
      return "◆";
    case "normal":
    default:
      return "❯";
  }
}
