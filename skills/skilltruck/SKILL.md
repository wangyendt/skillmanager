---
name: skilltruck
description: Manage Agent Skills with the SkillTruck (formerly SkillManager) CLI across Claude Code, Codex, Cursor, and other supported agents. Use whenever the user mentions skilltruck or skillmanager, installs or updates skills, chooses project/global scope, manages skill sources or profiles, uses Web UI selection, or syncs AGENTS.md.
---

# SkillTruck

Use `skilltruck` to install, update, remove, and synchronize Agent Skills across supported agents while preserving the user's sources and saved selections.

## Start safely

1. Run `skilltruck paths` when you need to locate the active configuration, cache, or profile directory.
2. Run `skilltruck source list` before changing sources so you can preserve existing entries and enabled states.
3. Distinguish the target scope:
   - Project scope installs into agent directories under the current project and is the default.
   - Global scope uses `--global` and installs into the user's global agent directories.
4. Treat installs and uninstalls as interactive unless the user has explicitly provided enough choices.

## Common workflows

### Install skills

```bash
skilltruck install
skilltruck install --global
skilltruck install owner/repo
```

Passing `owner/repo` or a GitHub URL registers that source and installs from it. Use `--dry-run` when the user wants a preview.

### Use the Web UI

```bash
skilltruck webui
skilltruck webui --global
skilltruck webui --mode uninstall
```

Use the Web UI when the user wants to search, filter by source, or select many skills and agents visually.

### Manage sources

```bash
skilltruck source list
skilltruck source add owner/repo
skilltruck source enable <id>
skilltruck source disable <id>
skilltruck source remove <id>
```

Add or update only the requested source. Do not replace the whole `sources.json`, because it may contain unrelated private or custom repositories.
Built-in sources may be removed; skilltruck preserves that choice in `removedSourceIds`. Adding the same built-in repository again restores its original ID; sources that used a custom ID must be restored with the same `--id`. Disabling a source keeps it configured but excludes it from installation and update workflows.

### Update or uninstall

```bash
skilltruck update
skilltruck update --global
skilltruck uninstall <skill-name>
skilltruck uninstall <skill-name> --global
```

Confirm scope and skill names before uninstalling. Use `--all` only when the user explicitly asks to remove every skill in the target scope.

### Work with profiles

```bash
skilltruck config show
skilltruck config set-default-profile <name>
skilltruck install --profile <name>
```

Profiles remember selected skills and selected agents. Preserve existing `selectedSkillIds` and `selectedAgentIdsByScope` when modifying profile files.

### Synchronize AGENTS.md

Add `--sync` to an install, update, or uninstall command only when the user wants `openskills sync` to update `AGENTS.md`.

## Guardrails

- Preserve unrelated sources, skills, profiles, and custom JSON fields.
- Prefer CLI commands over editing configuration files directly.
- Preview broad changes and confirm destructive operations.
- If a configuration file is malformed, report it and leave it untouched rather than replacing it with defaults.
