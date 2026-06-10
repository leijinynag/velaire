import type { NonSystemMessage } from "@/foundation/messages/types";

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
