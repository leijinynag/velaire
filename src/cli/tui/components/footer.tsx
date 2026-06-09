import { Box, Text } from "ink";

import type { TuiTokenUsageState } from "../runtime-reducer";

export function Footer({ tokenUsage }: { tokenUsage: TuiTokenUsageState }) {
  return (
    <Box marginTop={1} justifyContent="space-between" width="100%">
      <Text dimColor>/help for commands</Text>
      <Text dimColor>
        last input {formatCount(tokenUsage.latestInputTokens)} · session {formatCount(tokenUsage.sessionTotalTokens)}
      </Text>
    </Box>
  );
}

function formatCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
