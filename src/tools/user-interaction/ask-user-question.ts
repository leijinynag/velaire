import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

const optionSchema = z.object({
  label: z.string(),
  description: z.string(),
  preview: z.string().optional(),
});

const questionSchema = z.object({
  question: z.string(),
  header: z.string().max(12),
  options: z.array(optionSchema).min(2).max(4),
  multi_select: z.boolean(),
});

const schema = z.object({ questions: z.array(questionSchema).min(1).max(4) });

export type AskUserQuestionParameters = z.infer<typeof schema>;
export interface AskUserQuestionAnswer {
  question_index: number;
  selected_labels: string[];
}
export interface AskUserQuestionResult {
  answers: AskUserQuestionAnswer[];
}

function validateAnswers(params: AskUserQuestionParameters, result: AskUserQuestionResult): string | undefined {
  if (result.answers.length !== params.questions.length) return `expected ${params.questions.length} answers, got ${result.answers.length}`;
  const byIndex = new Map(result.answers.map((answer) => [answer.question_index, answer]));
  for (let index = 0; index < params.questions.length; index++) {
    const question = params.questions[index]!;
    const answer = byIndex.get(index);
    if (!answer) return `missing answer for question_index ${index}`;
    const labels = new Set(question.options.map((option) => option.label));
    for (const label of answer.selected_labels) {
      if (!labels.has(label)) return `unknown label ${JSON.stringify(label)} for question ${index}`;
    }
    if (question.multi_select) {
      if (answer.selected_labels.length < 1) return `multi-select question ${index} requires at least one selection`;
    } else if (answer.selected_labels.length !== 1) {
      return `single-select question ${index} requires exactly one selection`;
    }
  }
  return undefined;
}

export function createAskUserQuestionTool(callback: (params: AskUserQuestionParameters, toolUseId?: string) => Promise<AskUserQuestionResult> = async () => ({ answers: [] })): ToolDefinition<z.infer<typeof schema>, AskUserQuestionResult> {
  return {
    name: "ask_user_question",
    description: "Ask the user one or more independent fixed-choice questions and return validated selections.",
    schema,
    capabilities: ["user.interaction"],
    risk: { level: "low", reversible: true, description: "Only asks the user for input." },
    async execute(input, { signal, toolUseId }) {
      if (signal?.aborted) {
        return toolFailure({ summary: "Question aborted", modelContent: "ask_user_question was aborted.", code: "QUESTION_ABORTED", message: "Question was aborted." });
      }
      try {
        const result = await callback(input, toolUseId);
        if (signal?.aborted) {
          return toolFailure({ summary: "Question aborted", modelContent: "ask_user_question was aborted.", code: "QUESTION_ABORTED", message: "Question was aborted." });
        }
        const validationError = validateAnswers(input, result);
        if (validationError) {
          // 回调来自宿主 UI，仍需二次校验，避免无效选项进入模型上下文。
          return toolFailure({ summary: "Invalid user answer", modelContent: validationError, code: "INVALID_USER_ANSWER", message: validationError });
        }
        return toolSuccess({ summary: "User answered question(s).", modelContent: JSON.stringify(result), data: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolFailure({ summary: "Question callback failed", modelContent: message, code: "QUESTION_FAILED", message });
      }
    },
  };
}
