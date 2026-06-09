import type { NonSystemMessage } from "@/foundation/messages/types";

export class RuntimeTranscript {
  readonly messages: NonSystemMessage[] = [];

  append(message: NonSystemMessage): void {
    this.messages.push(message);
  }

  clear(): void {
    this.messages.length = 0;
  }
}
