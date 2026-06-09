# Velaire 实现文档（AI 读）

## 0. 项目命名

新项目名：**Velaire**

含义：

- `Vel`：velocity，强调 agent 执行效率、工具调度速度和开发反馈速度。
- `Aire`：agent / intelligence / runtime environment 的组合感，强调它不是单一 coding bot，而是一个可扩展 agent runtime。
- 名称短、易读、适合作为 CLI 命令：`velaire`。

目标定位：

> Velaire 是一个基于 Bun + TypeScript 的通用型 Agent Runtime，内置 Coding Agent preset，具备 mini Claude Code 级别的代码任务能力，同时在架构上支持 Research、Data、Ops 等更多领域 agent 扩展。

本项目不是逐行复制 Helixent，而是在完整复刻其能力的基础上，以更工程化、更安全、更可扩展、更好 UI 的方式重新实现。

---

## 1. 实现目标

### 1.1 必须达到的能力

Velaire 至少实现 Helixent 原项目的全部核心能力：

1. Bun + TypeScript CLI 项目。
2. 可发布为 npm package，并提供可执行命令。
3. 支持 `velaire` 无参数进入 TUI。
4. 支持 `--help`、`--version`。
5. 支持模型配置命令：
   - `velaire config model list`
   - `velaire config model add`
   - `velaire config model remove [name]`
   - `velaire config model set-default [name]`
6. 首次启动 wizard：
   - 选择 provider。
   - 输入 API Key。
   - 输入 model name。
   - 输入 base URL。
   - 确认并写入配置。
7. 支持 Anthropic provider。
8. 支持 OpenAI-compatible provider。
9. 支持 provider-reported token usage。
10. 支持 reasoning/thinking content。
11. 支持 ReAct-style Agent Loop。
12. 支持 streaming model response。
13. 支持 assistant tool calls。
14. 支持多个 tool call 并行执行。
15. 支持 tool result 回填 transcript 后继续模型调用。
16. 支持 abort/cancel。
17. 支持 middleware hooks。
18. 支持 structured tool result。
19. 支持 coding tools：
    - `bash`
    - `read_file`
    - `write_file`
    - `str_replace`
    - `list_files`
    - `glob_search`
    - `grep_search`
    - `apply_patch`
    - `file_info`
    - `mkdir`
    - `move_path`
    - `todo_write`
    - `ask_user_question`
20. 支持 Human-in-the-loop approval。
21. 支持 always-allow project permission。
22. 支持 settings 文件。
23. 支持 AGENTS.md 项目指导加载。
24. 支持 Skills：
    - skill discovery。
    - `SKILL.md` frontmatter 解析。
    - slash command 显式触发。
    - skill middleware 注入。
25. 内置至少两个 skills：
    - `coding-plan`
    - `deep-research-plan`
26. 支持 todo 状态：
    - `pending`
    - `in_progress`
    - `completed`
    - `cancelled`
27. 支持 Plan Mode。
28. 支持 Ink/React TUI：
    - header。
    - footer。
    - message history。
    - input box。
    - markdown render。
    - streaming indicator。
    - approval prompt。
    - ask-user prompt。
    - todo panel。
    - token usage footer。
29. 支持 slash commands：
    - `/clear`
    - `/help`
    - `/exit`
    - `/quit`
    - skill slash command。
30. 支持输入历史、Esc/Ctrl-C abort、基础快捷键。
31. 支持测试、lint、typecheck、build。
32. 支持 GitHub Actions 与 pre-commit hook。
33. 支持 README、中文 README、架构文档、贡献说明。

### 1.2 必须优于原项目的方向

Velaire 需要在以下方面比 Helixent 更好：

1. **通用化更强**
   - 不把 coding 写死为唯一 agent。
   - 使用 `AgentPreset` 抽象，coding 只是默认 preset。

2. **工具执行更安全**
   - 所有工具输入必须统一经过 schema parse。
   - 所有工具输出必须统一 normalized。
   - bash 支持 timeout、cwd、输出裁剪、风险分类。

3. **权限策略更系统**
   - 不只按工具名审批。
   - 引入 `ToolCapability` 和 `PolicyEngine`。
   - 支持 read/write/shell/network/destructive/external-side-effect 等能力标签。

4. **Provider contract 更强**
   - provider 能力显式声明。
   - provider-specific options 强类型化。
   - streaming event 统一归一化。

5. **TUI 更工程化**
   - TUI 不直接反推 transcript 状态。
   - Runtime 输出事件流，TUI 订阅 view model。
   - 消息渲染、工具摘要、approval、todo、footer 分层清楚。

6. **可解释性更强**
   - 引入 Agent Timeline。
   - 展示工具调用目的、风险、影响范围、可逆性。
   - 不暴露 chain-of-thought，只展示安全的解释摘要。

7. **测试体系更完整**
   - golden transcript。
   - provider fixtures。
   - policy matrix tests。
   - TUI reducer/view-model tests。

---

## 2. 技术栈

- Runtime：Bun。
- Language：TypeScript strict mode。
- Module：ESM。
- TUI：React + Ink。
- CLI：Commander。
- Schema：Zod。
- Config：YAML。
- Tests：Bun test。
- Lint：ESLint。
- Formatting：Prettier。
- Build：Bun build。
- Package：npm package with `bin` entry。

---

## 3. 顶层目录结构

建议目录：

```text
velaire/
  package.json
  bun.lock
  tsconfig.json
  eslint.config.js
  README.md
  README.zh.md
  AGENTS.md
  docs/
    architecture.md
    foundation.md
    runtime.md
    tools.md
    providers.md
    policy.md
    ui.md
    skills.md
    code-convention.md
  skills/
    coding-plan/
      SKILL.md
    deep-research-plan/
      SKILL.md
  src/
    index.ts
    foundation/
      messages/
      models/
      tools/
      events/
      errors/
    runtime/
      agent/
      middleware/
      scheduler/
      transcript/
      timeline/
    policy/
      engine/
      permissions/
      risk/
      redaction/
    presets/
      coding/
      research-lite/
    tools/
      workspace/
      shell/
      todo/
      user-interaction/
    providers/
      anthropic/
      openai-compatible/
    skills/
      discovery/
      manifest/
      middleware/
    config/
      schema.ts
      loader.ts
      writer.ts
    cli/
      index.tsx
      commands/
      first-run/
      tui/
        app.tsx
        store/
        components/
        hooks/
        renderers/
        themes/
    testing/
      fixtures/
      mock-provider.ts
      mock-tools.ts
  .github/
    workflows/
      check.yml
  .githooks/
    pre-commit
```

说明：

- `foundation` 只定义协议，不依赖 runtime、CLI、provider。
- `runtime` 实现通用 agent loop，不依赖 coding preset。
- `presets` 负责组合 system prompt、tools、skills、policy、UI hints。
- `tools` 是通用工具集合，coding preset 选择其中一部分。
- `policy` 是所有入口共用的权限、安全、风险决策层。
- `providers` 只做外部模型协议适配。
- `cli/tui` 只消费 runtime events 和 view model，不直接管理业务状态。

---

## 4. 核心架构原则

### 4.1 Core 不知道 Coding

严禁在 `foundation` 和 `runtime` 中出现 coding-specific 逻辑，例如：

- AGENTS.md。
- bash 是否审批。
- write_file 是否危险。
- Plan Mode 的具体 prompt。
- TUI 如何展示 patch。

这些都应由 preset、policy、tools、ui 层提供。

### 4.2 AgentPreset 是领域入口

定义：

```ts
export interface AgentPreset {
  name: string;
  description: string;
  systemPrompt: PresetSystemPromptFactory;
  tools: ToolFactory[];
  skills: SkillSelector;
  middleware: MiddlewareFactory[];
  policy: PolicyProfile;
  contextSources: ContextSource[];
  ui?: PresetUIHints;
}
```

内置 preset：

1. `coding`
   - 默认 preset。
   - 复刻 Helixent coding agent 能力。

2. `research-lite`
   - 作为通用化证明。
   - 初期只需要 read-only workspace、notes/todo、web 可延后。
   - 不要求达到 Claude Code 能力，只用于证明架构不是 coding-only。

CLI 默认：

```bash
velaire --preset coding
```

未来可支持：

```bash
velaire --preset research-lite
```

### 4.3 Runtime 只输出事件

Runtime 不直接操作 UI。Runtime 输出统一事件：

```ts
type AgentEvent =
  | { type: "agent.run.started"; runId: string }
  | { type: "agent.step.started"; stepId: string }
  | { type: "model.request.started"; provider: string; model: string }
  | { type: "model.delta"; content: ContentDelta }
  | { type: "model.message.completed"; message: AssistantMessage }
  | { type: "tool.requested"; toolCall: ToolCall; explanation?: ToolExplanation }
  | { type: "policy.decision"; decision: PolicyDecision }
  | { type: "approval.requested"; request: ApprovalRequest }
  | { type: "approval.resolved"; result: ApprovalResult }
  | { type: "tool.started"; toolCallId: string }
  | { type: "tool.completed"; toolCallId: string; result: NormalizedToolResult }
  | { type: "timeline.item.added"; item: TimelineItem }
  | { type: "agent.run.completed"; finalMessage?: AssistantMessage }
  | { type: "agent.error"; error: AgentError };
```

TUI 根据事件更新 view model。

### 4.4 所有工具统一执行管线

工具执行必须经过：

```text
tool_use input
  -> schema.parse
  -> policy.evaluate
  -> approval if needed
  -> execute with AbortSignal
  -> normalize result
  -> redact/summarize
  -> append tool_result
  -> emit timeline event
```

禁止工具直接绕过 policy。

### 4.5 不暴露 Chain-of-Thought

Velaire 可以支持 reasoning/thinking content 的 provider 事件，但 TUI 中的 Agent Timeline 只能展示安全解释：

- 工具调用目的。
- 预期结果。
- 风险等级。
- 影响范围。
- 是否可逆。
- 下一步状态。

不得要求模型输出或展示完整私有思维链。

---

## 5. Foundation 层设计

### 5.1 Messages

支持：

```ts
type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;
```

Content blocks：

```ts
type ContentBlock =
  | TextContent
  | ThinkingContent
  | ImageURLContent
  | ToolUseContent
  | ToolResultContent;
```

要求：

- Transcript 中所有消息必须是内部统一格式。
- Provider-specific 字段不得进入核心 message。
- Tool result 必须可序列化。
- 支持 token usage metadata。

### 5.2 Models

定义：

```ts
interface ModelProvider<TOptions = unknown> {
  name: string;
  capabilities: ProviderCapabilities;
  invoke(params: ProviderInvokeParams<TOptions>): Promise<AssistantMessage>;
  stream(params: ProviderInvokeParams<TOptions>): AsyncIterable<ModelStreamEvent>;
}
```

Provider capabilities：

```ts
interface ProviderCapabilities {
  streaming: boolean;
  toolUse: boolean;
  parallelToolUse: boolean;
  thinking: boolean;
  imageInput: boolean;
  tokenUsage: boolean;
  toolChoice: boolean;
  maxOutputTokens: boolean;
}
```

### 5.3 Tools

定义：

```ts
interface ToolDefinition<TInput> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  capabilities: ToolCapability[];
  risk: ToolRiskProfile;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}
```

Capabilities：

```ts
type ToolCapability =
  | "workspace.read"
  | "workspace.write"
  | "shell.execute"
  | "network.read"
  | "network.write"
  | "external.side_effect"
  | "destructive"
  | "user.interaction"
  | "planning";
```

Tool result：

```ts
type NormalizedToolResult =
  | {
      ok: true;
      summary: string;
      modelContent: string;
      displayContent?: string;
      data?: unknown;
      metadata?: Record<string, unknown>;
    }
  | {
      ok: false;
      summary: string;
      modelContent: string;
      error: ToolError;
      metadata?: Record<string, unknown>;
    };
```

---

## 6. Runtime 层设计

### 6.1 Agent Loop

核心流程：

```text
1. append user message
2. run beforeRun middleware
3. start step loop
4. call provider.stream
5. accumulate assistant message
6. emit model deltas
7. if no tool_use -> finish
8. if tool_use exists -> execute tools in parallel
9. append tool_result messages
10. continue until no tool_use or maxSteps reached
```

限制：

- 默认 `maxSteps = 100`。
- 工具并发必须可配置。
- 所有 step 都支持 AbortSignal。
- 所有错误进入结构化 `AgentError`。

### 6.2 Middleware

Hook：

```ts
interface AgentMiddleware {
  beforeRun?(ctx): MaybePromise<void>;
  afterRun?(ctx): MaybePromise<void>;
  beforeStep?(ctx): MaybePromise<void>;
  afterStep?(ctx): MaybePromise<void>;
  beforeModel?(ctx): MaybePromise<void>;
  afterModel?(ctx): MaybePromise<void>;
  beforeTool?(ctx): MaybePromise<ToolInterception | void>;
  afterTool?(ctx): MaybePromise<void>;
  onError?(ctx): MaybePromise<void>;
}
```

用途：

- Skills 注入。
- Todo reminder。
- Approval。
- Timeline。
- Token tracking。
- Tool result summarization。
- Budget control。

### 6.3 Agent Timeline

新增优于原项目的能力。

Timeline item：

```ts
interface TimelineItem {
  id: string;
  runId: string;
  stepId?: string;
  type:
    | "user_goal"
    | "context_loaded"
    | "model_response"
    | "tool_decision"
    | "policy_decision"
    | "approval"
    | "tool_result"
    | "verification"
    | "final_answer";
  title: string;
  detail?: string;
  risk?: RiskLevel;
  reversible?: boolean;
  affectedPaths?: string[];
  createdAt: string;
}
```

初版 timeline 由 deterministic 信息生成，不要求模型额外解释。后续可增加安全 explanation summary。

---

## 7. Policy 层设计

### 7.1 PolicyEngine

```ts
interface PolicyEngine {
  evaluate(action: ActionContext): Promise<PolicyDecision>;
}
```

ActionContext：

```ts
interface ActionContext {
  toolName: string;
  capabilities: ToolCapability[];
  input: unknown;
  workspaceRoot: string;
  affectedPaths?: string[];
  command?: string;
  presetName: string;
  userSettings: Settings;
  projectSettings: Settings;
}
```

Decision：

```ts
type PolicyDecision =
  | { type: "allow"; reason: string }
  | { type: "ask"; reason: string; risk: RiskAssessment }
  | { type: "deny"; reason: string }
  | { type: "transform"; reason: string; transformedInput: unknown };
```

### 7.2 RiskAssessment

```ts
interface RiskAssessment {
  level: "low" | "medium" | "high" | "critical";
  reversible: boolean;
  blastRadius: "none" | "single_file" | "multi_file" | "workspace" | "external";
  reasons: string[];
  suggestedGuard?: string;
}
```

### 7.3 默认规则

- `workspace.read`：默认允许。
- `workspace.write`：默认 ask。
- `shell.execute`：默认 ask。
- `destructive`：默认 ask 或 deny，取决于命令和路径。
- `external.side_effect`：默认 ask。
- `network.write`：默认 ask。
- 超出 workspace 的写操作：默认 deny。

---

## 8. Tools 层设计

### 8.1 Workspace tools

#### read_file

要求：

- 只接受绝对路径。
- 支持 offset/limit。
- 大文件截断。
- 输出包含行号。
- 二进制文件拒绝或摘要。

#### write_file

要求：

- 只接受绝对路径。
- 自动创建父目录可配置。
- 覆盖已有文件必须走 policy。
- 返回写入摘要。

#### str_replace

要求：

- old string 必须唯一。
- 不唯一返回结构化错误。
- 未找到返回结构化错误。
- 可生成 diff summary。

#### apply_patch

要求：

- 支持 unified diff。
- 应用失败要返回失败 hunks。
- 可计算 affected paths。

#### grep_search / glob_search / list_files / file_info / mkdir / move_path

要求：

- 统一路径验证。
- 统一 output limit。
- 统一 error code。

### 8.2 Shell tool

#### bash

必须优于原项目。

要求：

- 使用 `zsh -c` 或可配置 shell。
- 支持 cwd。
- 默认 cwd = workspace root。
- 支持 timeout。
- 支持 AbortSignal。
- 分离 stdout/stderr。
- 输出大于阈值时裁剪。
- 返回 exit code。
- 识别危险命令：
  - `rm -rf`
  - `git reset --hard`
  - `git clean -fd`
  - `git push --force`
  - `chmod -R`
  - `curl | sh`
  - 写入系统路径。
- 风险分类结果进入 approval UI。

### 8.3 Todo tool

`todo_write`：

- 支持创建、更新、完成、取消 todo。
- 支持当前 active item。
- TUI todo panel 从 runtime event/view model 渲染。

### 8.4 Ask user tool

`ask_user_question`：

- 支持单选、多选、自由文本。
- TUI 展示为交互 prompt。
- 用户回答作为 tool_result 回填。

---

## 9. Provider 层设计

### 9.1 OpenAI-compatible provider

支持：

- Chat Completions。
- streaming。
- function/tool calls。
- reasoning_content。
- token usage。
- baseURL/APIKey/model/options。

需要测试：

- 普通 text。
- tool call。
- 多 tool call。
- streaming tool call input JSON。
- malformed partial JSON。
- usage。
- provider error。

### 9.2 Anthropic provider

支持：

- Messages API。
- streaming。
- tool_use。
- thinking。
- token usage。
- max_tokens。

需要测试：

- text delta。
- thinking delta。
- tool_use block。
- tool input。
- stop reason。
- usage。
- error。

### 9.3 Provider adapter 规则

- Provider-specific raw event 不进入 runtime。
- Runtime 只接收 `ModelStreamEvent`。
- Provider options 必须强类型。
- capability 不支持时必须显式降级或报错。

---

## 10. Skills 设计

### 10.1 Discovery

搜索路径：

```text
${workspace}/.agents/skills
${workspace}/.velaire/skills
${VELAIRE_HOME}/skills
~/.agents/skills
~/.velaire/skills
./skills
```

### 10.2 Manifest

`SKILL.md` frontmatter：

```yaml
name: coding-plan
description: Structured coding task planning
version: 1.0.0
permissions:
  - workspace.read
trustLevel: builtin
```

正文为 skill instructions。

### 10.3 Conflict resolution

同名 skill 不直接覆盖。规则：

1. builtin。
2. project。
3. user home。
4. explicit slash path。

TUI `/help` 中显示来源。

### 10.4 Built-in skills

必须内置：

- `coding-plan`
- `deep-research-plan`

---

## 11. CLI 与配置设计

### 11.1 Config 路径

默认：

```text
~/.velaire/config.yaml
```

环境变量：

```text
VELAIRE_HOME
```

### 11.2 Config schema

```yaml
version: 1
defaultModel: claude
agent:
  defaultPreset: coding
models:
  - name: claude
    provider: anthropic
    model: claude-sonnet-4-6
    apiKey: ${ANTHROPIC_API_KEY}
    baseURL: null
    options:
      maxTokens: 4096
settings:
  permissions:
    allow: []
    deny: []
```

注意：

- 使用 `apiKey`，不要使用 `APIKey`。
- 支持环境变量引用。
- 所有默认值从 schema 或 registry 生成文档。

### 11.3 CLI commands

```bash
velaire
velaire --help
velaire --version
velaire --preset coding
velaire config model list
velaire config model add
velaire config model remove [name]
velaire config model set-default [name]
```

后续可扩展：

```bash
velaire preset list
velaire skills list
velaire doctor
```

---

## 12. TUI 设计

### 12.1 目标

Velaire 的 UI 必须比 Helixent 更清晰、更工程化、更适合演示。

核心思路：

```text
Runtime events -> TUI store/reducer -> ViewModel -> Components
```

禁止组件直接处理复杂业务状态。

### 12.2 Layout

建议布局：

```text
┌────────────────────────────────────────────────────────────┐
│ Velaire · coding · claude-sonnet · workspace: helixent       │
├────────────────────────────────────────────────────────────┤
│ Message History                                             │
│                                                            │
│  User: ...                                                  │
│  Assistant: ...                                             │
│  Tool: read_file src/agent/agent.ts                         │
│    purpose: inspect agent loop                              │
│    risk: low · read-only                                    │
│                                                            │
├───────────────────────┬────────────────────────────────────┤
│ Todo / Plan            │ Timeline / Risk                    │
│  [>] inspect runtime   │  1. loaded AGENTS.md               │
│  [ ] update provider   │  2. requested bash · medium risk   │
├───────────────────────┴────────────────────────────────────┤
│ input >                                                     │
├────────────────────────────────────────────────────────────┤
│ tokens: in 1200 / out 320 · step 3 · tools 2 · mode ask      │
└────────────────────────────────────────────────────────────┘
```

### 12.3 Components

```text
Header
Footer
MessageHistory
MessageItem
ToolUseSummary
ToolResultSummary
TimelinePanel
TodoPanel
InputBox
SlashCommandPicker
ApprovalPrompt
AskUserPrompt
ErrorBanner
StatusLine
```

### 12.4 Slash commands

必须支持：

- `/clear`
- `/help`
- `/exit`
- `/quit`
- `/timeline`
- `/todos`
- `/skills`
- `/preset`

其中 `/timeline` 是新增差异化能力。

### 12.5 Approval UI

Approval prompt 显示：

```text
Tool: bash
Command: bun run check
Risk: medium
Reversible: yes
Blast radius: workspace
Reason: executes project validation command
Suggested guard: review output before further writes

[Allow once] [Always allow in project] [Deny]
```

### 12.6 Timeline UI

Timeline 显示：

```text
[1] User goal: refactor provider contract
[2] Context loaded: AGENTS.md
[3] Tool decision: read_file src/foundation/models/model.ts
    Purpose: inspect provider interface
    Risk: low · reversible: yes
[4] Tool result: found ModelProvider.invoke/stream
[5] Policy: apply_patch requires approval
```

---

## 13. Preset 设计

### 13.1 coding preset

包含：

- AGENTS.md loader。
- coding system prompt。
- workspace tools。
- shell tool。
- todo tool。
- ask user tool。
- skills middleware。
- approval middleware。
- timeline middleware。
- token usage middleware。

### 13.2 research-lite preset

MVP 包含：

- read-only workspace tools。
- todo tool。
- ask user tool。
- deep-research-plan skill。
- 不默认启用 shell/write/apply_patch。

目的：证明 Velaire 是通用 agent runtime，不是 hardcoded coding CLI。

---

## 14. 测试策略

### 14.1 测试命令

```bash
bun run check
bun run check:types
bun run lint
bun test
```

### 14.2 Unit tests

覆盖：

- message schema。
- provider capabilities。
- tool schema parse。
- policy risk assessment。
- settings schema。
- skill manifest parse。
- timeline item creation。

### 14.3 Integration tests

覆盖：

- agent loop no tool。
- agent loop single tool。
- agent loop parallel tools。
- unknown tool。
- invalid tool input。
- tool execution failure。
- approval allow。
- approval deny。
- abort。
- max step guard。

### 14.4 Provider fixture tests

覆盖：

- Anthropic text streaming。
- Anthropic tool_use streaming。
- OpenAI-compatible tool call streaming。
- reasoning content。
- token usage。
- malformed JSON。
- provider error。

### 14.5 Tool tests

覆盖每个 tool：

- success。
- invalid input。
- permission-required metadata。
- failure。
- output truncation。
- structured error code。

### 14.6 TUI tests

优先测 reducer/view model，而不是复杂真实终端：

- model.delta 更新 message。
- tool.started 添加 tool state。
- tool.completed 更新 summary。
- approval.requested 打开 prompt。
- timeline.item.added 更新 timeline panel。
- token usage 更新 footer。

### 14.7 E2E smoke

- `velaire --help`。
- `velaire config model list`。
- 首次启动 wizard 可以取消。
- 使用 mock provider 启动 TUI 并提交简单消息。

---

## 15. 构建与发布

### 15.1 Scripts

```json
{
  "scripts": {
    "dev": "bun run src/index.ts",
    "check": "tsc --noEmit && eslint . --ext .ts,.tsx && bun test",
    "check:types": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "build:js": "rm -rf dist/js && bun build ./src/index.ts --outdir ./dist/js --splitting --target bun",
    "build:bin": "rm -rf dist/bin && bun build ./src/index.ts --compile --outfile dist/bin/velaire",
    "hooks:install": "git config core.hooksPath .githooks"
  }
}
```

### 15.2 Package

```json
{
  "name": "velaire",
  "bin": {
    "velaire": "dist/bin/velaire"
  },
  "files": ["dist/bin/velaire", "dist/js", "README.md", "README.zh.md"],
  "type": "module"
}
```

---

## 16. 正常开发顺序

实现时必须按以下顺序推进，不要先写 TUI，也不要先接复杂 provider：

1. 工程骨架。
2. Foundation 类型。
3. Tool protocol。
4. Mock provider。
5. 最小 agent loop。
6. Tool executor。
7. Policy engine。
8. Coding tools。
9. OpenAI-compatible provider。
10. Anthropic provider。
11. Skills。
12. Presets。
13. Config/CLI。
14. TUI event store。
15. TUI components。
16. Approval/Todo/Timeline UI。
17. Plan Mode。
18. Tests 补全。
19. Docs。
20. Build/release。

---

## 17. 至少 50 个 Git Commit 点

要求：实现过程中至少设置 50 个 commit 点。建议使用下面 80 个 commit 点。每个 commit 应小而完整，必须通过当前阶段对应测试。

### Phase 0：工程骨架

1. `chore: initialize bun typescript project`
2. `chore: add package metadata and scripts`
3. `chore: configure tsconfig and path aliases`
4. `chore: add eslint and prettier baseline`
5. `docs: add initial velaire architecture overview`
6. `chore: add basic source directory structure`

### Phase 1：Foundation

7. `feat(foundation): add message role and content types`
8. `feat(foundation): add thinking image and token usage types`
9. `feat(foundation): add normalized error types`
10. `feat(foundation): add model provider contract`
11. `feat(foundation): add provider capabilities descriptor`
12. `feat(foundation): add model wrapper`
13. `feat(foundation): add tool definition helper`
14. `feat(foundation): add structured tool result types`
15. `test(foundation): cover message model and tool contracts`
16. `docs(foundation): document core primitives`

### Phase 2：Runtime MVP

17. `feat(testing): add mock provider and mock tools`
18. `feat(runtime): add transcript store`
19. `feat(runtime): add agent context`
20. `feat(runtime): implement basic model call loop`
21. `feat(runtime): parse assistant tool uses`
22. `feat(runtime): execute single tool call`
23. `feat(runtime): append tool results to transcript`
24. `feat(runtime): continue loop after tool results`
25. `feat(runtime): execute parallel tool calls`
26. `feat(runtime): add max step guard`
27. `feat(runtime): add abort signal support`
28. `feat(runtime): add agent event stream`
29. `test(runtime): cover no tool single tool and parallel tools`

### Phase 3：Middleware、Policy、Timeline

30. `feat(runtime): add middleware bus`
31. `feat(runtime): add before and after model hooks`
32. `feat(runtime): add before and after tool hooks`
33. `feat(policy): add tool capability model`
34. `feat(policy): add risk assessment model`
35. `feat(policy): implement default policy engine`
36. `feat(policy): add approval decision types`
37. `feat(runtime): route tool calls through policy engine`
38. `feat(timeline): add timeline item model`
39. `feat(timeline): emit tool decision timeline events`
40. `test(policy): cover read write shell and destructive decisions`
41. `test(timeline): cover runtime timeline events`

### Phase 4：Tools

42. `feat(tools): add workspace path validation utilities`
43. `feat(tools): add read_file tool`
44. `feat(tools): add write_file tool`
45. `feat(tools): add str_replace tool`
46. `feat(tools): add list_files tool`
47. `feat(tools): add glob_search tool`
48. `feat(tools): add grep_search tool`
49. `feat(tools): add file_info tool`
50. `feat(tools): add mkdir tool`
51. `feat(tools): add move_path tool`
52. `feat(tools): add apply_patch tool`
53. `feat(tools): add bash tool with timeout and output caps`
54. `feat(tools): classify shell command risk`
55. `feat(tools): add todo_write tool`
56. `feat(tools): add ask_user_question tool`
57. `test(tools): cover workspace read write and edit tools`
58. `test(tools): cover shell timeout abort and risk classification`
59. `test(tools): cover todo and user question tools`

### Phase 5：Providers

60. `feat(provider-openai): add openai-compatible provider shell`
61. `feat(provider-openai): convert messages and tools`
62. `feat(provider-openai): parse non-streaming responses`
63. `feat(provider-openai): accumulate streaming text and tool calls`
64. `feat(provider-openai): support reasoning content and usage`
65. `test(provider-openai): cover conversion and streaming fixtures`
66. `feat(provider-anthropic): add anthropic provider shell`
67. `feat(provider-anthropic): convert messages and tools`
68. `feat(provider-anthropic): parse streaming content blocks`
69. `feat(provider-anthropic): support thinking tool use and usage`
70. `test(provider-anthropic): cover streaming fixtures`

### Phase 6：Skills、Presets、Settings

71. `feat(skills): add skill manifest parser`
72. `feat(skills): add skill discovery paths`
73. `feat(skills): add skills middleware`
74. `feat(skills): add builtin coding plan skill`
75. `feat(skills): add builtin deep research plan skill`
76. `test(skills): cover discovery conflicts and middleware`
77. `feat(settings): add config and settings schema`
78. `feat(settings): load user and project settings`
79. `feat(presets): add agent preset contract`
80. `feat(presets): add coding preset`
81. `feat(presets): add research-lite preset`
82. `test(presets): cover preset tool and middleware composition`

### Phase 7：CLI

83. `feat(cli): add commander entry point`
84. `feat(cli): add version and help output`
85. `feat(cli): add model config loader and writer`
86. `feat(cli): add config model list command`
87. `feat(cli): add config model add command`
88. `feat(cli): add config model remove command`
89. `feat(cli): add config model set-default command`
90. `feat(cli): add first-run wizard`
91. `feat(cli): create agent from selected preset`
92. `test(cli): cover config commands and first-run abort`

### Phase 8：TUI

93. `feat(tui): add event store and reducer`
94. `feat(tui): add app shell layout`
95. `feat(tui): add header and footer components`
96. `feat(tui): add message history component`
97. `feat(tui): add input box component`
98. `feat(tui): connect input to runtime events`
99. `feat(tui): add slash command registry`
100. `feat(tui): add slash command picker`
101. `feat(tui): add clear help exit and quit commands`
102. `feat(tui): add tool use and result summaries`
103. `feat(tui): add approval prompt with risk details`
104. `feat(tui): add ask user prompt`
105. `feat(tui): add todo panel`
106. `feat(tui): add timeline panel`
107. `feat(tui): add token usage footer`
108. `feat(tui): add themes and improved spacing`
109. `feat(tui): add input history and word navigation`
110. `test(tui): cover reducer and view model updates`
111. `test(tui): cover slash command registry and input editor`

### Phase 9：Plan Mode、Docs、Quality、Release

112. `feat(plan): add plan mode runtime state`
113. `feat(plan): wire coding-plan skill to plan mode`
114. `feat(plan): render plan mode status in tui`
115. `test(plan): cover plan mode transitions`
116. `docs: add readme quick start and model config guide`
117. `docs: add chinese readme`
118. `docs: add architecture runtime tools providers and policy guides`
119. `chore: add github actions check workflow`
120. `chore: add pre-commit hook`
121. `fix(build): add library entrypoint`
122. `fix(pkg): configure binary build and publish files`
123. `chore: add build js and binary scripts`
124. `test: complete core integration coverage`
125. `chore(release): prepare initial release metadata`

最低要求：至少提交前 80 个 commit 点。完整实现建议使用全部 125 个。

---

## 18. 与 Helixent 的差异总结

### 18.1 保留

- Bun + TypeScript 技术栈。
- Foundation / Agent / Coding / CLI 分层思想。
- ReAct loop。
- 并行工具执行。
- Anthropic / OpenAI-compatible provider。
- Coding tools。
- Approval。
- Skills。
- Todo。
- Plan Mode。
- Ink TUI。
- Bun test + ESLint + TypeScript quality gate。

### 18.2 改进

- 从 coding-only 变成 preset-based 通用 agent。
- 工具执行统一 schema parse、policy、normalize。
- bash 工具具备 timeout、cwd、output cap、risk classification。
- provider 有 capability descriptor。
- TUI 由 runtime event 驱动。
- 增加 Agent Timeline 和 risk/reversibility 展示。
- policy engine 独立于 UI。
- settings/config 命名更统一。
- 文档从 schema/registry 尽量同步生成或测试校验。

### 18.3 避免

- 不要把 provider-specific 字段塞进核心 message。
- 不要让 TUI 成为业务状态源。
- 不要让 approval 只存在于 UI 层。
- 不要跳过工具运行时校验。
- 不要无界并行工具调用。
- 不要将 raw stdout 无限制塞进模型上下文。
- 不要展示模型私有 chain-of-thought。

---

## 19. AI 实现要求

如果由 AI 继续实现，请严格遵守：

1. 每个阶段先写测试，再写实现，除非是纯文档或项目初始化。
2. 每个 commit 点保持小范围、可验证。
3. 每完成一个阶段运行：
   - `bun run check:types`
   - `bun test`
   - 阶段完成时运行 `bun run check`
4. 不允许跳过 policy engine 直接执行危险工具。
5. 不允许把 CLI/TUI 逻辑写入 runtime。
6. 不允许把 coding preset 逻辑写入 foundation。
7. 新增 provider 必须有 fixture tests。
8. 新增 tool 必须有 schema、capabilities、risk profile、tests。
9. 新增 TUI 交互必须优先更新 store/reducer，再写组件。
10. 文档必须随 public API、CLI 命令、config schema 变化同步更新。

---

## 20. MVP 完成标准

MVP 不是全部 125 个 commit 的终点。MVP 完成需要满足：

1. `velaire --help` 可用。
2. `velaire config model add/list/remove/set-default` 可用。
3. 首次启动 wizard 可用。
4. coding preset 可启动。
5. TUI 可提交消息。
6. Mock provider 下 agent loop 可完成：
   - 无工具回答。
   - 单工具调用。
   - 多工具并行调用。
7. OpenAI-compatible provider 可真实调用。
8. Anthropic provider 可真实调用。
9. read/write/str_replace/grep/glob/bash/apply_patch 可用。
10. approval prompt 可用。
11. todo panel 可用。
12. timeline panel 可用。
13. skills 可发现并被 slash command 触发。
14. `bun run check` 通过。
15. README 和 README.zh 包含安装、配置、运行说明。

---

## 21. 首个版本发布标准

`v1.0.0` 发布标准：

1. 完成 Helixent 等价能力。
2. 完成 Velaire 新增核心差异：
   - AgentPreset。
   - PolicyEngine。
   - ToolCapability。
   - Agent Timeline。
   - Better TUI event store。
3. 所有内置 tools 有测试。
4. 两个 provider 有 fixture tests。
5. CLI/TUI 有 smoke tests。
6. 文档完整。
7. npm binary build 可运行。
8. GitHub Actions 通过。

---

## 22. 最终愿景

Velaire 的长期目标不是成为另一个 Claude Code clone，而是成为：

> 一个轻量、可读、可扩展、可审计的 TypeScript Agent Runtime。

它的差异化是：

- 通用 agent preset。
- 事件驱动 runtime。
- 工具安全策略。
- 可解释 timeline。
- 更好的 TUI 工作台。
- 对 AI 二次开发友好的工程结构。

如果实现得当，Velaire 可以同时作为：

1. 一个可用的 coding agent CLI。
2. 一个学习 Claude Code-style agent 的开源教学项目。
3. 一个可以扩展 Research/Data/Ops agents 的通用 runtime。
4. 一个简历上足够有技术深度和差异化的 AI Agent 工程项目。
