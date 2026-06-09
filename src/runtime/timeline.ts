import type { RuntimeEvent, TimelineItem } from "@/foundation/events/types";

export type TimelineItemInput = Omit<TimelineItem, "id" | "timestamp"> & {
  id?: string;
  timestamp?: string;
};

export class RuntimeTimeline {
  readonly items: TimelineItem[] = [];

  constructor(private readonly runId = "run") {}

  add(input: TimelineItemInput): RuntimeEvent {
    const item: TimelineItem = {
      id: input.id ?? `${this.runId}:timeline:${this.items.length + 1}`,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    this.items.push(item);
    return { type: "timeline.item.added", runId: this.runId, item };
  }
}
