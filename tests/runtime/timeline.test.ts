import { describe, expect, test } from "bun:test";

import { RuntimeTimeline } from "@/runtime/timeline";
import { createTodoWriteTool } from "@/tools/todo";

describe("timeline and todo integration", () => {
  test("creates timeline events for all required item kinds", () => {
    const timeline = new RuntimeTimeline("run_1");
    const kinds = [
      "user_goal",
      "model_response",
      "tool_decision",
      "policy_decision",
      "approval",
      "tool_result",
      "verification",
      "final_answer",
    ] as const;

    const events = kinds.map((kind, index) => timeline.add({ kind, title: kind, summary: `item ${index}` }));

    expect(events.every((event) => event.type === "timeline.item.added")).toBe(true);
    expect(timeline.items.map((item) => item.kind)).toEqual([...kinds]);
    expect(timeline.items[0]?.id).toBe("run_1:timeline:1");
  });

  test("todo_write supports all required statuses", async () => {
    const tool = createTodoWriteTool();
    const result = await tool.execute(
      {
        todos: [
          { id: "1", content: "A", status: "pending" },
          { id: "2", content: "B", status: "in_progress" },
          { id: "3", content: "C", status: "completed" },
          { id: "4", content: "D", status: "cancelled" },
        ],
        merge: false,
      },
      { cwd: "/tmp" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.counts).toEqual({ pending: 1, in_progress: 1, completed: 1, cancelled: 1 });
    }
  });
});
