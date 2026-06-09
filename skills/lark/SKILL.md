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

1. Prefer existing authenticated Lark tools or MCP integrations when available.
2. Ask for the target document, chat, calendar, or workspace only when it is not clear.
3. Do not invent private Lark URLs or IDs.
4. For write operations, summarize the intended change before making external side effects.
5. Keep outputs structured and ready to paste into 飞书 when no API tool is available.

## Output style

Use concise Chinese by default for 飞书 workflows. For status updates, prefer:

- 背景
- 进展
- 风险
- 下一步
