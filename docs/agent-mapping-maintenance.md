# Agent Mapping Maintenance

`manifests/agents.json` is maintained against the Supported Agents table in the `vercel-labs/skills` README.

Source of truth:

- Repo: `https://github.com/vercel-labs/skills`
- Section: `Supported Agents`
- Direct link: `https://github.com/vercel-labs/skills?tab=readme-ov-file#supported-agents`

Update rule:

1. Use the README table above as the only source of truth for agent `name`, `id`, `projectPath`, and `globalPath`.
2. Expand grouped rows into separate entries in `manifests/agents.json`.
3. Ignore trailing slash differences such as `.agents/skills` vs `.agents/skills/`; treat them as equivalent.
4. After updating mappings, also update `source.retrievedAt` in `manifests/agents.json`.
5. If an upstream agent path changes, prefer matching upstream exactly rather than preserving historical local behavior.

Current example:

- `Cline` should map to project `.agents/skills` and global `~/.agents/skills` per the upstream table.
