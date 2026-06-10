import { z } from "zod";

import { toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { createTodoReminderMiddleware } from "./reminder";

const todoStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);

const todoSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: todoStatusSchema,
});

const schema = z.object({
  todos: z.array(todoSchema),
  merge: z.boolean().default(false),
});

type Todo = z.infer<typeof todoSchema>;
type TodoStatus = z.infer<typeof todoStatusSchema>;

function counts(todos: Todo[]): Record<TodoStatus, number> {
  const result: Record<TodoStatus, number> = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const todo of todos) result[todo.status]++;
  return result;
}

export function createTodoWriteTool(): ToolDefinition<z.infer<typeof schema>, { todos: Todo[]; counts: Record<TodoStatus, number> }> {
  return createTodoSystem().tool;
}

// todo store 是单次工具系统的会话状态，tool 和 reminder middleware 必须共享同一份。
export function createTodoSystem() {
  const store: Todo[] = [];

  const tool: ToolDefinition<z.infer<typeof schema>, { todos: Todo[]; counts: Record<TodoStatus, number> }> = {
    name: "todo_write",
    description: "Create or update the in-memory task list for the current session.",
    schema,
    capabilities: ["planning"],
    risk: { level: "low", reversible: true, description: "Updates only the session todo list." },
    async execute({ todos, merge }) {
      if (merge) {
        for (const todo of todos) {
          const index = store.findIndex((candidate) => candidate.id === todo.id);
          if (index >= 0) store[index] = todo;
          else store.push(todo);
        }
      } else {
        store.length = 0;
        store.push(...todos);
      }
      const data = { todos: [...store], counts: counts(store) };
      const summaryParts = Object.entries(data.counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${count} ${status}`);
      return toolSuccess({
        summary: `Todo list updated. ${store.length} item(s): ${summaryParts.join(", ") || "none"}.`,
        modelContent: JSON.stringify(data, null, 2),
        data,
      });
    },
  };

  return {
    tool,
    middleware: createTodoReminderMiddleware({ getTodos: () => [...store] }),
  };
}
