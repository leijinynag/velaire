import type { ApprovalDecision, ApprovalRequest, ApprovalRequestInput } from "./types";

export class ApprovalManager {
  private readonly maxQueueSize: number;
  private queue: ApprovalRequest[] = [];
  private currentRequest?: ApprovalRequest;
  private subscriber?: (request: ApprovalRequest | null) => void;

  constructor({ maxQueueSize = 20 }: { maxQueueSize?: number } = {}) {
    this.maxQueueSize = maxQueueSize;
  }

  requestApproval(input: ApprovalRequestInput): Promise<ApprovalDecision> {
    return new Promise((resolve) => {
      if (this.queue.length >= this.maxQueueSize) {
        resolve("deny");
        return;
      }
      this.queue.push({ ...input, resolve });
      this.processQueue();
    });
  }

  respond(decision: ApprovalDecision): void {
    if (!this.currentRequest) {
      return;
    }
    this.currentRequest.resolve(decision);
    this.currentRequest = undefined;
    this.processQueue();
  }

  subscribe(callback: (request: ApprovalRequest | null) => void): () => void {
    this.subscriber = callback;
    this.processQueue();
    return () => {
      this.subscriber = undefined;
    };
  }

  private processQueue(): void {
    if (this.currentRequest) {
      return;
    }
    this.currentRequest = this.queue.shift();
    this.subscriber?.(this.currentRequest ?? null);
  }
}
