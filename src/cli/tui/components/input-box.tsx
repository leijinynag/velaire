import { Box, Text, useInput, useStdin } from "ink";
import { useCallback, useState } from "react";

export function InputBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const { isRawModeSupported } = useStdin();

  const submit = useCallback(() => {
    const value = text.trim();
    if (!value) return;
    setText("");
    onSubmit(value);
  }, [onSubmit, text]);

  useInput((input, key) => {
    if (key.return) {
      submit();
      return;
    }
    if (key.backspace || key.delete) {
      setText((current) => current.slice(0, -1));
      return;
    }
    if (key.ctrl && input.toLowerCase() === "c") {
      process.exit(0);
    }
    // Ink 会把方向键等控制输入也传进来；只接收可打印字符，避免污染命令文本。
    if (input && !key.ctrl && !key.meta && input >= " ") {
      setText((current) => current + input);
    }
  }, { isActive: Boolean(isRawModeSupported) });

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
      <Text>› {text || "Type a prompt or /help"}</Text>
    </Box>
  );
}
