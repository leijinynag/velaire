import { deriveConversationView, deriveMetricsView } from "@/ui-state";

import { AgentCanvas } from "./components/conversation";
import { Header } from "./components/header";
import { InspectorPanel } from "./components/inspector";
import { ActivityRail, FilesPanel, RailDrawer, SessionsPanel, SettingsPanel, SkillsPanel } from "./components/rail";
import { ResizableWorkbenchLayout } from "./components/resizable-layout";
import { WorkspaceLanding } from "./components/workspace";
import { useWorkbenchRun } from "./hooks/use-workbench-run";

// ── Top-level app ──────────────────────────────────────────────────────────────

export function WorkbenchApp() {
  const {
    state,
    sessionId,
    sessions,
    workspace,
    serverWorkspace,
    availablePresets,
    skills,
    workspaceFiles,
    filesLoading,
    theme,
    toggleTheme,
    runMode,
    setRunMode,
    createSession,
    switchSession,
    switchWorkspace,
    submitPrompt,
    stopRun,
    runPrompt,
    approve,
    answerQuestion,
    refreshSkills,
    refreshWorkspaceFiles,
    fetchSessions,
    selectedToolUseId,
    setSelectedToolUseId,
    selectedInspector,
    setSelectedInspector,
    mode,
    error,
    activeRailItem,
    toggleRailItem,
  } = useWorkbenchRun();

  const conversation = deriveConversationView(state);
  const metrics = deriveMetricsView(state);
  const selectedTool = selectedToolUseId ? state.tools[selectedToolUseId] : null;
  const selectedPolicy = selectedToolUseId ? state.policyDecisions[selectedToolUseId] : null;

  function handleTimelineToolClick(toolUseId: string) {
    setSelectedToolUseId(toolUseId);
    setSelectedInspector("tool");
  }

  const handleSubmit = mode === "demo"
    ? runPrompt
    : (prompt: string) => submitPrompt(prompt, { mode: runMode });
  const latestSpecArtifact = Object.values(state.orchestration.artifacts).find((artifact) => artifact.kind === "spec") ?? null;
  const canStartImplementation = state.orchestration.status === "awaiting_approval";
  const handleStartImplementation = latestSpecArtifact && canStartImplementation
    ? () => submitPrompt("Continue from approved spec.", { mode: "multi-agent", specPath: latestSpecArtifact.path })
    : undefined;
  const drawer = activeRailItem === "Sessions" ? (
    <RailDrawer title="Sessions">
      <SessionsPanel
        sessions={sessions}
        currentSessionId={sessionId}
        serverWorkspace={serverWorkspace}
        availablePresets={availablePresets}
        onNew={(ws, preset) => void createSession(ws, preset)}
        onSelect={(sid) => void switchSession(sid)}
        onRefresh={fetchSessions}
      />
    </RailDrawer>
  ) : activeRailItem === "Skills" ? (
    <RailDrawer title="Skills">
      <SkillsPanel
        skills={skills}
        onRefresh={() => refreshSkills(workspace ?? undefined)}
        onCreateSkill={(name, desc) => void handleSubmit(`请帮我创建一个技能文件，路径为 ~/.velaire/skills/${name}/SKILL.md，技能名称为"${name}"，描述为：${desc}。请先创建目录，再写入包含正确 frontmatter（name 和 description 字段）以及工作流说明的 SKILL.md 文件。`)}
      />
    </RailDrawer>
  ) : activeRailItem === "Files" ? (
    <RailDrawer title="Files">
      <FilesPanel
        workspace={workspace}
        files={workspaceFiles}
        loading={filesLoading}
        onRefresh={() => refreshWorkspaceFiles(workspace)}
      />
    </RailDrawer>
  ) : activeRailItem === "Settings" ? (
    <RailDrawer title="Settings">
      <SettingsPanel
        mode={mode}
        workspace={workspace}
        sessionCount={sessions.length}
        skillCount={skills.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefreshSessions={fetchSessions}
        onRefreshSkills={() => refreshSkills(workspace ?? undefined)}
      />
    </RailDrawer>
  ) : null;

  // live 模式下且没有 session 时显示落地页
  if (mode === "live" && !sessionId) {
    return (
      <div className="wb-root">
        <Header state={state} mode={mode} metrics={metrics} workspace={workspace} theme={theme} onToggleTheme={toggleTheme} />
        <WorkspaceLanding
          serverWorkspace={serverWorkspace}
          onSelect={(ws, preset) => void createSession(ws, preset)}
        />
      </div>
    );
  }

  return (
    <div className="wb-root">
      <Header
        state={state}
        mode={mode}
        metrics={metrics}
        workspace={workspace}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSwitchWorkspace={switchWorkspace}
      />
      <ResizableWorkbenchLayout
        rail={<ActivityRail activeItem={activeRailItem} onToggle={toggleRailItem} />}
        drawer={drawer}
        canvas={<AgentCanvas
          state={state}
          conversation={conversation}
          error={error}
          onSubmit={handleSubmit}
          runMode={runMode}
          onRunModeChange={setRunMode}
          onStartImplementation={handleStartImplementation}
          onStop={stopRun}
          onSelectTool={setSelectedToolUseId}
          onApprove={approve}
          onAnswerQuestion={answerQuestion}
        />}
        inspector={<InspectorPanel
          state={state}
          selectedInspector={selectedInspector}
          onSelectInspector={setSelectedInspector}
          selectedTool={selectedTool}
          selectedPolicy={selectedPolicy}
          metrics={metrics}
          onTimelineToolClick={handleTimelineToolClick}
        />}
      />
    </div>
  );
}
