import { Box, Text } from "ink";

import { VELAIRE_VERSION } from "@/index";

export function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">Velaire</Text>
      <Text dimColor>v{VELAIRE_VERSION} · {process.cwd()}</Text>
    </Box>
  );
}
