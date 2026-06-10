const secretKeyPattern = /api[_-]?key|token|secret|password/i;

// 按字段名递归脱敏，避免 settings、工具输入或日志泄漏凭证。
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = secretKeyPattern.test(key) ? "[redacted]" : redactSecrets(nestedValue);
  }
  return output;
}
