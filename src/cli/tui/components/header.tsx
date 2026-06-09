import { Box, Text } from "ink";

import { VELAIRE_VERSION } from "@/index";

import { currentTheme } from "../themes";

export const SHARK_LOGO_LINES = ["   ▄████▄", " ▄██▀●  ▀▌", "▐██  ___/", " ▀████▀"] as const;

export function Header({ modelName }: { modelName?: string }) {
  return (
    <Box columnGap={2}>
      <Logo />
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Text color={currentTheme.colors.primary}>Velaire</Text>
          <Text color={currentTheme.colors.dimText}>v{VELAIRE_VERSION}</Text>
        </Box>
        <Box>
          <Text color={currentTheme.colors.dimText}>{modelName ?? "unknown model"}</Text>
        </Box>
        <Box columnGap={1}>
          <Text color={currentTheme.colors.dimText}>{process.cwd()}</Text>
        </Box>
      </Box>
    </Box>
  );
}

export function Logo({ color = currentTheme.colors.primary }: { color?: string }) {
  return (
    <Box flexDirection="column">
      {SHARK_LOGO_LINES.map((line) => (
        <Text key={line} color={color}>{line}</Text>
      ))}
    </Box>
  );
}
