# Velaire

Velaire 是一个基于 Bun + TypeScript 的通用 Agent Runtime，内置 provider adapter、权限策略、工具、skills、presets 和 CLI。它的目标不是只做 coding bot，而是支持 Coding、Research、Data、Ops 等可扩展智能体场景。

## 快速开始

### 安装

发布后可从 npm 安装：

```bash
npm install -g velaire@latest
```

从源码运行：

```bash
git clone <repo-url> velaire
cd velaire
bun install
bun run build:bin
```

包会提供 `velaire` 可执行命令。本地开发可使用 `bun run dev` 或 `bun run index.ts`。

### 配置模型

Velaire 的用户配置保存在 `${VELAIRE_HOME:-~/.velaire}/config.yaml`。

交互式配置：

```bash
velaire config model add
velaire config model list
velaire config model set-default <name>
```

删除不用的模型：

```bash
velaire config model remove <name>
```

最小配置示例：

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

使用 `VELAIRE_HOME` 可以隔离不同配置、测试新配置，或分离工作与个人凭证：

```bash
VELAIRE_HOME=/tmp/velaire-home velaire config model list
```

### 首次运行

在项目目录中启动：

```bash
cd path/to/project
velaire
```

如果配置不存在，首次启动向导会询问 provider、API Key、model name、可选 base URL，并写入 `${VELAIRE_HOME:-~/.velaire}/config.yaml`。

### 非交互运行

`run` 适合脚本和 CI smoke check：

```bash
velaire run --provider mock --preset research-lite --prompt "Summarize this workspace"
```

当前非交互命令支持 `mock` provider。真实 provider 的配置由 model config 命令和 provider adapters 管理。

### Presets

Preset 负责组合 system prompt、tools、skills、policy profile、middleware 和 UI hints。

- `coding`：默认产品目标，面向代码任务，包含 workspace、shell、todo、ask-user、approval、skills、timeline 等能力。
- `research-lite`：偏只读的研究 preset，用于证明 runtime 不是 hardcoded coding-only。

显式选择 preset：

```bash
velaire --preset coding
velaire run --provider mock --preset research-lite --prompt "Create a brief research plan"
```

### Skills

Skill 是带 `SKILL.md` frontmatter 的 Markdown 指令包。内置 skills：

- `coding-plan`
- `deep-research-plan`

发现路径包括项目目录、Velaire home、兼容的 agent 目录和内置目录：

```text
${workspace}/.agents/skills
${workspace}/.velaire/skills
${VELAIRE_HOME}/skills
~/.agents/skills
~/.velaire/skills
./skills
```

支持的 UI 中，slash command 可以显式触发 skill。

### 权限

每个工具声明能力标签，例如 `workspace.read`、`workspace.write`、`shell.execute`、`network.read`、`network.write`、`external.side_effect`、`destructive`、`user.interaction`、`planning`。

Policy engine 会结合工具名、能力、输入、影响路径、preset 和 settings 做决策。默认规则偏保守：

- 只读 workspace 工具默认允许。
- 写入、shell、外部副作用、破坏性操作默认询问。
- workspace 外写入默认拒绝。
- 项目级 always-allow 权限保存在 `.velaire/settings.json`；本机临时授权保存在 `.velaire/settings.local.json`，不要提交。

## 开发

```bash
bun install
bun run check:types
bun run lint
bun test
bun run check
```

每个 clone 只需要安装一次本地 git hook 路径：

```bash
bun run hooks:install
```

`bun run check` 是发布前质量门禁，会运行 typecheck、lint 和测试。

## 架构文档

- [架构总览](./docs/architecture.md)
- [Foundation](./docs/foundation.md)
- [Runtime](./docs/runtime.md)
- [Tools](./docs/tools.md)
- [Providers](./docs/providers.md)
- [Policy](./docs/policy.md)
- [UI](./docs/ui.md)
- [Skills](./docs/skills.md)
- [代码规范](./docs/code-convention.md)

## 发布检查

发布或打 tag 前：

1. 在干净 checkout 中运行 `bun install --frozen-lockfile`。
2. 运行 `bun run check`。
3. 运行 `bun run build:bin`，确认 `dist/bin/velaire` 存在。
4. Smoke test：`velaire --help`、`velaire --version`、`velaire config model list` 和一条 `velaire run --provider mock ...` 命令。
5. 确认文档与当前 CLI、config schema、presets、skills、permissions、`VELAIRE_HOME` 行为一致。
