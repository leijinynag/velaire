# Tools / 工具

Velaire tools are reusable actions selected by presets and governed by policy.

## Execution pipeline

```text
input -> schema parse -> policy -> approval -> execute -> normalize -> redact/summarize -> transcript -> timeline
```

All tools must validate input before execution and return normalized results.

## Capability tags

Tools declare capabilities such as:

- `workspace.read`
- `workspace.write`
- `shell.execute`
- `network.read`
- `network.write`
- `external.side_effect`
- `destructive`
- `user.interaction`
- `planning`

Policy uses these tags to decide allow, ask, deny, or transform.

## Workspace tools

Expected coding preset tools:

- `read_file`: absolute path, optional offset/limit, line-numbered text, bounded output.
- `write_file`: absolute path, parent creation when allowed, overwrite through policy.
- `str_replace`: unique old string requirement, structured not-found/non-unique errors.
- `list_files`: bounded directory listing.
- `glob_search`: bounded glob matches under validated roots.
- `grep_search`: bounded content search with path and line context.
- `apply_patch`: unified diff application and affected path reporting.
- `file_info`: file metadata summary.
- `mkdir`: directory creation through policy.
- `move_path`: path move/rename through policy.

## Shell tool

`bash` should support cwd, timeout, abort, stdout/stderr separation, exit code, output caps, and risk classification. Risky commands include destructive git operations, recursive delete/chmod, `curl | sh`, force push, and writes to system paths.

## Todo tool

`todo_write` manages task state for plan mode and TUI panels. Supported states are:

- `pending`
- `in_progress`
- `completed`
- `cancelled`

## Ask-user tool

`ask_user_question` lets the runtime request human input through a normalized tool result. It should support free text, single choice, and multiple choice when the UI provides those interactions.

## Output limits

Tools must avoid returning unbounded stdout, huge files, binary content, secrets, or raw provider-sensitive payloads. Prefer short summaries plus bounded model content.
