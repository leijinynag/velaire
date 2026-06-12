export interface FileChange {
  path: string;
  kind: "created" | "modified" | "moved" | "deleted";
  previousPath?: string;
  before?: string;
  after?: string;
  diff?: string;
  toolUseId?: string;
}

export interface FileChangeData {
  fileChanges: FileChange[];
}

export function createTextDiff(before: string, after: string): string {
  const beforeLines = trimTrailingEmptyLine(before.split("\n"));
  const afterLines = trimTrailingEmptyLine(after.split("\n"));
  const max = Math.max(beforeLines.length, afterLines.length);
  const lines: string[] = [];
  for (let index = 0; index < max; index++) {
    const left = beforeLines[index];
    const right = afterLines[index];
    if (left === right && left !== undefined) lines.push(` ${left}`);
    else {
      if (left !== undefined) lines.push(`-${left}`);
      if (right !== undefined) lines.push(`+${right}`);
    }
  }
  return lines.join("\n");
}

function trimTrailingEmptyLine(lines: string[]): string[] {
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}
