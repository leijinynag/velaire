export interface AgentError {
  code: string;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}
