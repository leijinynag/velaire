import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { platform } from "node:os";

export type PickFolderFailureCode = "UNSUPPORTED_PLATFORM" | "PICKER_CANCELLED" | "PICKER_FAILED";

export type PickFolderResult =
  | { ok: true; path: string }
  | { ok: false; code: PickFolderFailureCode; message: string };

export type NativeFolderPicker = (cwd: string) => Promise<PickFolderResult>;

export const pickNativeFolder: NativeFolderPicker = async (cwd) => {
  const currentPlatform = platform();
  const command = pickerCommand(currentPlatform, cwd);
  if (!command) {
    return {
      ok: false,
      code: "UNSUPPORTED_PLATFORM",
      message: "Native folder picker is not available on this platform.",
    };
  }

  try {
    const proc = Bun.spawn({
      cmd: command,
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    const pickedPath = stdout.trim();
    if (exitCode !== 0) {
      return {
        ok: false,
        code: exitCode === 1 && !pickedPath ? "PICKER_CANCELLED" : "PICKER_FAILED",
        message: stderr.trim() || "Folder selection was cancelled.",
      };
    }
    if (!pickedPath) {
      return { ok: false, code: "PICKER_CANCELLED", message: "Folder selection was cancelled." };
    }

    return validatePickedDirectory(pickedPath);
  } catch (error) {
    return {
      ok: false,
      code: "PICKER_FAILED",
      message: error instanceof Error ? error.message : "Failed to open native folder picker.",
    };
  }
};

function pickerCommand(currentPlatform: NodeJS.Platform, cwd: string): string[] | null {
  if (currentPlatform === "darwin") {
    return [
      "osascript",
      "-e",
      `POSIX path of (choose folder with prompt "Choose a Velaire workspace" default location POSIX file "${escapeAppleScript(cwd)}")`,
    ];
  }

  if (currentPlatform === "linux") {
    if (existsSync("/usr/bin/zenity")) return ["zenity", "--file-selection", "--directory", "--title=Choose a Velaire workspace"];
    if (existsSync("/usr/bin/kdialog")) return ["kdialog", "--getexistingdirectory", cwd, "Choose a Velaire workspace"];
  }

  if (currentPlatform === "win32") {
    return [
      "powershell",
      "-NoProfile",
      "-Command",
      [
        "Add-Type -AssemblyName System.Windows.Forms;",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;",
        "$dialog.Description = 'Choose a Velaire workspace';",
        `$dialog.SelectedPath = '${escapePowerShell(cwd)}';`,
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath } else { exit 1 }",
      ].join(" "),
    ];
  }

  return null;
}

async function validatePickedDirectory(pathname: string): Promise<PickFolderResult> {
  try {
    const directoryStat = await stat(pathname);
    if (!directoryStat.isDirectory()) {
      return { ok: false, code: "PICKER_FAILED", message: `Picked path is not a directory: ${pathname}` };
    }
    return { ok: true, path: await realpath(pathname) };
  } catch {
    return { ok: false, code: "PICKER_FAILED", message: `Picked directory does not exist: ${pathname}` };
  }
}

function escapeAppleScript(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function escapePowerShell(value: string): string {
  return value.replaceAll("'", "''");
}
