import type { RuntimeEvent } from "@/foundation/events/types";

export function parseSseRuntimeEvents(text: string): RuntimeEvent[] {
  return text
    .split("\n\n")
    .map((block) => block.split("\n").find((line) => line.startsWith("data: "))?.slice("data: ".length))
    .filter((line): line is string => !!line)
    .map((line) => JSON.parse(line) as RuntimeEvent);
}
