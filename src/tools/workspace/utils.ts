import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const DEFAULT_MAX_CHARS = 12_000;
export const DEFAULT_LIMIT = 200;

export function ensureAbsolutePath(path: string): { ok: true } | { ok: false; message: string } {
  if (!isAbsolute(path)) {
    return { ok: false, message: `Path must be absolute: ${path}` };
  }
  return { ok: true };
}

export async function ensureDirectoryPath(path: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const absolute = ensureAbsolutePath(path);
  if (!absolute.ok) return absolute;

  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return { ok: false, message: `Path is not a directory: ${path}` };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Directory is not accessible: ${path}. ${message}` };
  }
}

// 先 resolve 再比较相对路径，防止通过 .. 或相对路径绕过 workspace 边界。
export function isWithinDirectory(root: string, target: string): boolean {
  const relativePath = relative(resolve(root), resolve(target));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function ensureWithinDirectory(root: string, target: string): { ok: true } | { ok: false; message: string } {
  const absolute = ensureAbsolutePath(target);
  if (!absolute.ok) return absolute;
  if (!isWithinDirectory(root, target)) return { ok: false, message: `Path is outside the workspace: ${target}` };
  return { ok: true };
}

export function truncateText(text: string, maxChars = DEFAULT_MAX_CHARS): { text: string; truncated: boolean; originalLength: number } {
  if (text.length <= maxChars) {
    return { text, truncated: false, originalLength: text.length };
  }
  const marker = `\n... [truncated ${text.length - maxChars} chars]`;
  const keep = Math.max(0, maxChars - marker.length);
  return { text: `${text.slice(0, keep)}${marker}`, truncated: true, originalLength: text.length };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
