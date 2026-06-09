const secretKeyPattern = /api[_-]?key|token|secret|password/i;

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
