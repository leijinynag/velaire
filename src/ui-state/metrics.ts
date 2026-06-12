import type { AgentUiState } from "./agent-ui-state";

export interface AgentMetricsView {
  toolCount: number;
  failedToolCount: number;
  approvalCount: number;
  agentCount: number;
  latestInputTokens: number;
  latestOutputTokens: number;
  sessionTotalTokens: number;
}

export function deriveMetricsView(state: AgentUiState): AgentMetricsView {
  const tools = Object.values(state.tools);
  return {
    toolCount: tools.length,
    failedToolCount: tools.filter((tool) => tool.status === "failed").length,
    approvalCount: Object.keys(state.approvals).length,
    agentCount: Object.keys(state.agents).length,
    latestInputTokens: state.tokenUsage.latestInputTokens,
    latestOutputTokens: state.tokenUsage.latestOutputTokens,
    sessionTotalTokens: state.tokenUsage.sessionTotalTokens,
  };
}
