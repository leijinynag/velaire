import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";

import type { ToolUseContent } from "@/foundation";
import type { ApprovalDecision, ApprovalRequestInput } from "@/policy/types";

export const APPROVAL_OPTIONS: readonly {
  decision: ApprovalDecision;
  label: string;
  shortcut: string;
  color: "green" | "red";
}[] = [
  { decision: "allow_once", label: "Yes — this time only", shortcut: "y", color: "green" },
  { decision: "allow_always_project", label: "Yes, always allow in this project", shortcut: "a", color: "green" },
  { decision: "deny", label: "No", shortcut: "n", color: "red" },
];

export function buildApprovalToolUse(request: ApprovalRequestInput): ToolUseContent {
  return { type: "tool_use", id: request.toolUseId, name: request.toolName, input: request.input };
}

export function ApprovalPrompt({
  request,
  supportProjectWideAllow = false,
  onDecision,
}: {
  request: ApprovalRequestInput;
  supportProjectWideAllow?: boolean;
  onDecision: (decision: ApprovalDecision) => void;
}) {
  const options = useMemo(
    () => (supportProjectWideAllow ? APPROVAL_OPTIONS : APPROVAL_OPTIONS.filter((option) => option.decision !== "allow_always_project")),
    [supportProjectWideAllow],
  );
  const [index, setIndex] = useState(0);
  const toolUse = buildApprovalToolUse(request);
  const shortcutHint = supportProjectWideAllow ? "y / a / n" : "y / n";

  useInput((input, key) => {
    if (key.upArrow) {
      setIndex((current) => (current > 0 ? current - 1 : options.length - 1));
      return;
    }
    if (key.downArrow) {
      setIndex((current) => (current < options.length - 1 ? current + 1 : 0));
      return;
    }
    if (key.return) {
      onDecision(options[index]!.decision);
      return;
    }
    const keyName = input.toLowerCase();
    if (keyName === "y" || input === "1") onDecision("allow_once");
    else if (supportProjectWideAllow && (keyName === "a" || input === "2")) onDecision("allow_always_project");
    else if (supportProjectWideAllow && (keyName === "n" || input === "3")) onDecision("deny");
    else if (!supportProjectWideAllow && (keyName === "n" || input === "2")) onDecision("deny");
  });

  const args = JSON.stringify(toolUse.input, null, 2);
  const displayArgs = args.length > 500 ? `${args.slice(0, 500)}\n... (truncated)` : args;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>
        Agent wants to run a high-risk tool: <Text color="white">{toolUse.name}</Text>
      </Text>
      <Box marginTop={1}>
        <Text dimColor>{displayArgs}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Allow execution?</Text>
        <Text dimColor>↑/↓ to move · Enter to confirm · shortcuts: {shortcutHint}</Text>
        {options.map((option, optionIndex) => (
          <Text key={option.decision} color={optionIndex === index ? "cyan" : undefined}>
            {optionIndex === index ? "❯ " : "  "}
            <Text color={option.color}>[{option.shortcut}]</Text> {option.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
