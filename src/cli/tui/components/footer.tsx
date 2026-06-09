import { Box, Text } from "ink";

import type { TuiTokenUsageState } from "../runtime-reducer";
import { currentTheme } from "../themes";

export function Footer({ modelName, tokenUsage }: { modelName?: string; tokenUsage: TuiTokenUsageState }) {
  return (
    <Box paddingX={2} width="100%">
      <Box flexGrow={1} justifyContent="flex-start">
        <Text color={currentTheme.colors.dimText}>{modelName ?? "unknown model"}</Text>
      </Box>
      <Box justifyContent="flex-end">
        <Text color={currentTheme.colors.dimText}>
          last input {formatCount(tokenUsage.latestInputTokens)} · session {formatCount(tokenUsage.sessionTotalTokens)}
        </Text>
      </Box>
    </Box>
  );
}

function formatCount(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}
