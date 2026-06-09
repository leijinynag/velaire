# Skills / 技能

Skills are reusable Markdown instruction bundles discovered at startup and injected by middleware or explicit slash commands.

## Manifest

Each skill uses `SKILL.md` with frontmatter:

```yaml
name: coding-plan
description: Structured coding task planning
version: 1.0.0
permissions:
  - workspace.read
trustLevel: builtin
```

The Markdown body contains the instructions that the model receives.

## Discovery paths

Velaire searches:

```text
${workspace}/.agents/skills
${workspace}/.velaire/skills
${VELAIRE_HOME}/skills
~/.agents/skills
~/.velaire/skills
./skills
```

`VELAIRE_HOME` defaults to `~/.velaire` and can be overridden per process.

## Built-in skills

- `coding-plan`: task planning for coding work.
- `deep-research-plan`: structured research planning.

## Conflict handling

Same-name skills from multiple locations should not silently overwrite each other. Registry entries should preserve source metadata so `/help` or `/skills` can show where each skill came from and conflict resolution remains auditable.

## Middleware

Skill middleware may inject instructions based on preset, explicit slash command, trust level, or user selection. It should not bypass policy: skill-declared permissions are input to policy, not direct authorization.

## Slash commands

When UI support is available, `/skill-name` should load that skill explicitly. Unknown skill commands should return a clear error and list available skills.

## Authoring guidance

- Keep skills focused on one workflow.
- Declare permissions narrowly.
- Avoid secrets in skill files.
- Include concrete steps and expected outputs.
- Update docs and tests when adding built-in skills.
