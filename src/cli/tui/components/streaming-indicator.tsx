import { Text } from "ink";

export function StreamingIndicator({ streaming }: { streaming: boolean }) {
  if (!streaming) return null;
  return <Text dimColor>Streaming…</Text>;
}
