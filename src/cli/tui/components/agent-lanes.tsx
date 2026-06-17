import { Box, Text } from "ink";

import type { AgentLaneState } from "@/ui-state";

import { currentTheme } from "../themes";

export function AgentLanes({ agents }: { agents: Record<string, AgentLaneState> }) {
  const lanes = Object.values(agents).filter((agent) => agent.id !== "default");
  if (lanes.length === 0) return null;

  return (
    <Box paddingX={2} columnGap={1} flexWrap="wrap">
      {lanes.map((agent) => (
        <Box key={agent.id} columnGap={1}>
          <Text color={statusColor(agent.status)}>{statusGlyph(agent.status)}</Text>
          <Text color={currentTheme.colors.dimText}>{agent.name}</Text>
          <Text color={currentTheme.colors.dimText}>step {agent.step ?? 0}</Text>
        </Box>
      ))}
    </Box>
  );
}

function statusGlyph(status: AgentLaneState["status"]): string {
  if (status === "running") return "●";
  if (status === "failed") return "✕";
  return "○";
}

function statusColor(status: AgentLaneState["status"]): string {
  if (status === "running") return currentTheme.colors.primary;
  if (status === "failed") return "red";
  return currentTheme.colors.dimText;
}
