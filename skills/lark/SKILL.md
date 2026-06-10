---
name: lark
description: 飞书 / Lark 工作协作助手：帮助处理飞书文档、消息、会议纪要、日历、表格、审批、云文档和联系人相关任务。
version: 1.0.0
permissions:
  - network.read
  - network.write
trustLevel: builtin
---

# Lark / 飞书 Skill

Use this skill when the user asks for Lark/飞书 work collaboration tasks, including:

- 飞书文档、Wiki、云文档、表格、幻灯片
- 飞书消息、联系人、群聊
- 飞书日历、会议、会议纪要
- 飞书审批、任务、OKR
- 将项目进展整理成飞书可发送格式

## Rules

1. Prefer existing authenticated Lark tools, MCP integrations, or the local `lark-cli` command when available.
2. If the user says the 飞书 CLI is already installed, first perform safe read-only discovery (`command -v lark-cli`, `lark-cli --help`, or checking common nvm binary paths) instead of asking repeated setup questions.
3. If `lark-cli` is installed under nvm, use the absolute binary path or temporarily extend `PATH` with the matching `~/.nvm/versions/node/*/bin` directory before running it.
4. Ask for the target document, chat, calendar, or workspace only when it is not clear.
5. Do not invent private Lark URLs, chat IDs, user IDs, document tokens, or calendar IDs.
6. For write operations, summarize the intended change before making external side effects and rely on normal tool approval.
7. Keep outputs structured and ready to paste into 飞书 when no API tool is available.

## Local CLI workflow

When using the shell tool, include a short `description` and prefer this order:

1. Discover the CLI without side effects:
   - `command -v lark-cli || command -v feishu || command -v lark`
   - If not found, inspect likely nvm paths such as `~/.nvm/versions/node/*/bin/lark-cli`.
2. Verify the command shape with `lark-cli --help` or a subcommand-specific `--help`.
3. For read-only Lark operations, run the CLI directly after discovery.
4. For write operations such as sending messages or editing docs, briefly state the target and content before executing.
5. Do not repeatedly call `ask_user_question` for environment discovery; only ask the user when an identifier or business decision is missing.

## Output style

Use concise Chinese by default for 飞书 workflows. For status updates, prefer:

- 背景
- 进展
- 风险
- 下一步
