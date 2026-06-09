import { Box, Text } from "ink";

import type { NonSystemMessage } from "@/foundation/messages/types";

export function MessageHistory({ messages, errorText }: { messages: NonSystemMessage[]; errorText?: string | null }) {
  return (
    <Box flexDirection="column" rowGap={1}>
      {messages.map((message, index) => (
        <MessageRow key={`${message.role}:${index}`} message={message} />
      ))}
      {errorText ? <Text color="red">Error: {errorText}</Text> : null}
    </Box>
  );
}

function MessageRow({ message }: { message: NonSystemMessage }) {
  if (message.role === "user") {
    return <Text color="white">› {message.content.map((block) => block.type === "text" ? block.text : "[image]").join("\n")}</Text>;
  }

  if (message.role === "assistant") {
    return (
      <Box flexDirection="column">
        {message.content.map((block, index) => {
          if (block.type === "text") return <Text key={index} color="green">{block.text}</Text>;
          if (block.type === "tool_use") return <Text key={index} dimColor>Tool call: {block.name}</Text>;
          return <Text key={index} dimColor>[thinking]</Text>;
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {message.content.map((block, index) => (
        <Text key={index} dimColor>Tool result: {block.content}</Text>
      ))}
    </Box>
  );
}
