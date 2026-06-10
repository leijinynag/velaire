import type { ApprovalDecision, ApprovalRequest, ApprovalRequestInput } from "./types";

export class ApprovalManager {
  private readonly maxQueueSize: number;
  private queue: ApprovalRequest[] = [];
  private request?: ApprovalRequest;
  private subscriber?: (request: ApprovalRequest | null) => void;

  constructor({ maxQueueSize = 20 }: { maxQueueSize?: number } = {}) {
    this.maxQueueSize = maxQueueSize;
  }

  get currentRequest(): ApprovalRequest | undefined {
    return this.request;
  }

  // runtime 以 Promise 等待审批，TUI 通过队列逐个展示并 resolve。
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
    if (!this.request) return;
    this.request.resolve(decision);
    this.request = undefined;
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
    if (this.request) return;
    this.request = this.queue.shift();
    this.subscriber?.(this.request ?? null);
  }
}
