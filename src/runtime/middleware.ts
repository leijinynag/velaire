import type { AssistantMessage } from "@/foundation/messages/types";
import type { ProviderInvokeParams } from "@/providers/types";

import type { Transcript } from "./types";

export interface AgentMiddleware {
  beforeModel?: (params: { transcript: Transcript; modelContext: ProviderInvokeParams }) => Promise<void> | void;
  afterModel?: (params: { transcript: Transcript; message: AssistantMessage }) => Promise<void> | void;
}
