import type { NonSystemMessage } from "@/foundation/messages/types";

// Transcript 只保存可续传的非 system 消息，systemPrompt 由 runtime 单独注入。
export class RuntimeTranscript {
  constructor(readonly messages: NonSystemMessage[] = []) {}

  append(message: NonSystemMessage): void {
    this.messages.push(message);
  }

  prepend(message: NonSystemMessage): void {
    this.messages.unshift(message);
  }

  snapshot(): NonSystemMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages.length = 0;
  }
}
