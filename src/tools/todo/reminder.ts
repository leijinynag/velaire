import type { AgentMiddleware } from "@/runtime/middleware";

export interface TodoReminderState {
  getTodos(): Array<{ id: string; content: string; status: string }>;
}

const REMINDER_CONFIG = {
  STEPS_SINCE_WRITE: 10,
  STEPS_BETWEEN_REMINDERS: 10,
} as const;

// reminder 按模型调用轮次触发，避免用 UI 定时器影响 runtime 行为。
export function createTodoReminderMiddleware(state: TodoReminderState): AgentMiddleware {
  let stepsSinceLastWrite = Infinity;
  let stepsSinceLastReminder = Infinity;

  return {
    beforeModel: ({ modelContext }) => {
      stepsSinceLastWrite++;
      stepsSinceLastReminder++;
      const todos = state.getTodos();
      if (
        todos.length > 0 &&
        stepsSinceLastWrite >= REMINDER_CONFIG.STEPS_SINCE_WRITE &&
        stepsSinceLastReminder >= REMINDER_CONFIG.STEPS_BETWEEN_REMINDERS
      ) {
        stepsSinceLastReminder = 0;
        modelContext.systemPrompt += formatReminder(todos);
      }
    },
    afterToolUse: ({ toolUse }) => {
      if (toolUse.name === "todo_write") stepsSinceLastWrite = 0;
    },
  };
}

function formatReminder(todos: Array<{ content: string; status: string }>): string {
  const lines = todos.map((todo, index) => `${index + 1}. [${todo.status}] ${todo.content}`).join("\n");
  return `\n<todo_reminder>\nThe todo_write tool hasn't been used recently. If you're working on tasks that benefit from tracking, consider updating your todo list. Only use it if relevant to the current work. Here are the current items:\n\n${lines}\n</todo_reminder>`;
}
