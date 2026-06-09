import type { RuntimeEvent, TimelineItem } from "@/foundation/events/types";

export class RuntimeTimeline {
  readonly items: TimelineItem[] = [];

  add(item: TimelineItem): RuntimeEvent {
    this.items.push(item);
    return { type: "timeline.item.added", runId: item.id.split(":")[0] ?? "run", item };
  }
}
