import { Box, Text } from "ink";

import type { PromptSubmission, SlashCommand } from "../command-registry";
import { useCommandInput } from "../hooks/use-command-input";
import { currentTheme } from "../themes";

import { CommandList } from "./command-list";
import { HighlightedInput } from "./highlighted-input";

export function InputBox({
  commands,
  isActive = true,
  onSubmit,
  onAbort,
}: {
  commands: SlashCommand[];
  isActive?: boolean;
  onSubmit?: (submission: PromptSubmission) => void;
  onAbort?: () => void;
}) {
  const { filteredCommands, highlightedCommandName, pickerOpen, placeholder, selectedIndex, text, cursorOffset } =
    useCommandInput({
      commands,
      isActive,
      onSubmit,
      onAbort,
    });

  return (
    <Box flexDirection="column" rowGap={1}>
      {pickerOpen ? <CommandList commands={filteredCommands} selectedIndex={selectedIndex} /> : null}
      <Box
        borderLeft={false}
        borderRight={false}
        borderStyle="single"
        borderColor={currentTheme.colors.borderColor}
        columnGap={1}
      >
        <Text>❯</Text>
        <HighlightedInput
          cursorOffset={cursorOffset}
          highlightedCommandName={highlightedCommandName}
          placeholder={placeholder}
          value={text}
        />
      </Box>
    </Box>
  );
}
