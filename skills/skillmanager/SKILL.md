---
name: skillmanager
description: Manage Agent Skills with the skillmanager CLI across Claude Code, Codex, Cursor, and other supported agents. Use this skill whenever the user mentions skillmanager, installing or updating skills, project/global skill scope, skill sources, profiles, Web UI selection, or syncing AGENTS.md—even if they do not explicitly ask to use the skillmanager command.
---

# Skillmanager

Use `skillmanager` to install, update, remove, and synchronize Agent Skills across supported agents while preserving the user's sources and saved selections.

## Start safely

1. Run `skillmanager paths` when you need to locate the active configuration, cache, or profile directory.
2. Run `skillmanager source list` before changing sources so you can preserve existing entries and enabled states.
3. Distinguish the target scope:
   - Project scope installs into agent directories under the current project and is the default.
   - Global scope uses `--global` and installs into the user's global agent directories.
4. Treat installs and uninstalls as interactive unless the user has explicitly provided enough choices.

## Common workflows

### Install skills

```bash
skillmanager install
skillmanager install --global
skillmanager install owner/repo
```

Passing `owner/repo` or a GitHub URL registers that source and installs from it. Use `--dry-run` when the user wants a preview.

### Use the Web UI

```bash
skillmanager webui
skillmanager webui --global
skillmanager webui --mode uninstall
```

Use the Web UI when the user wants to search, filter by source, or select many skills and agents visually.

### Manage sources

```bash
skillmanager source list
skillmanager source add owner/repo
skillmanager source enable <id>
skillmanager source disable <id>
skillmanager source remove <id>
```

Add or update only the requested source. Do not replace the whole `sources.json`, because it may contain unrelated private or custom repositories.
Built-in sources may be removed; skillmanager preserves that choice in `removedSourceIds`. Adding the same built-in repository again restores its original ID; sources that used a custom ID must be restored with the same `--id`. Disabling a source keeps it configured but excludes it from installation and update workflows.

### Update or uninstall

```bash
skillmanager update
skillmanager update --global
skillmanager uninstall <skill-name>
skillmanager uninstall <skill-name> --global
```

Confirm scope and skill names before uninstalling. Use `--all` only when the user explicitly asks to remove every skill in the target scope.

### Work with profiles

```bash
skillmanager config show
skillmanager config set-default-profile <name>
skillmanager install --profile <name>
```

Profiles remember selected skills and selected agents. Preserve existing `selectedSkillIds` and `selectedAgentIdsByScope` when modifying profile files.

### Synchronize AGENTS.md

Add `--sync` to an install, update, or uninstall command only when the user wants `openskills sync` to update `AGENTS.md`.

## Guardrails

- Preserve unrelated sources, skills, profiles, and custom JSON fields.
- Prefer CLI commands over editing configuration files directly.
- Preview broad changes and confirm destructive operations.
- If a configuration file is malformed, report it and leave it untouched rather than replacing it with defaults.
