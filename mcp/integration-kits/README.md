# Prompt Switchboard Integration Kits

This folder carries the **repo-owned host packets** for the current Prompt
Switchboard builder surface.

Keep the claims narrow and honest:

- local MCP sidecar only
- no hosted relay
- no public HTTP API
- no general-purpose SDK claim
- public bundle shipped does **not** mean official marketplace listing published

## Current Truth By Host

| Host        | Current truth                                                                       | Repo-owned asset                                                                                                                                                                                  | Where it goes                                                                                              |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Codex       | strongest repo-specific host binding                                                | `codex.config.toml.example`, `codex.skill.prompt-switchboard.md.example`, `public-bundles/codex-bundle/`                                                                                          | paste the MCP block into your Codex `config.toml`                                                          |
| Claude Code | strongest repo-specific host binding                                                | `claude.mcp.json.example`, `claude.skill.prompt-switchboard.md.example`, `public-bundles/claude-code-bundle/`                                                                                     | paste the MCP block into your Claude Code config such as `.mcp.json`                                       |
| OpenCode    | public-bundle-ready generic MCP lane, but no verified official listing yet          | `opencode.jsonc.example`, `opencode.skill.prompt-switchboard.md.example`, `public-bundles/opencode-plugin/`                                                                                       | save as project-root `opencode.jsonc` in your Prompt Switchboard clone or publish the plugin package later |
| OpenClaw    | public-bundle-ready generic MCP registry lane, but no verified official listing yet | `openclaw.prompt-switchboard.json.example`, `openclaw.mcp.servers.json.example`, `openclaw.mcp.set.example.sh`, `openclaw.skill.prompt-switchboard.md.example`, `public-bundles/openclaw-bundle/` | register with `openclaw mcp set`, drop the definition under `mcp.servers`, or publish the bundle later     |

## Public Distribution Layer

Use these files together:

- public truth page: `docs/public-distribution-matrix.html`
- host packet page: `docs/mcp-host-packets.html`
- machine-readable host setup truth: `support-matrix.json`
- machine-readable public listing truth: `public-distribution-matrix.json`
- machine-readable publish-subject split: `distribution-subject-map.json`
- bundle packet directories: `public-bundles/`
- release-ready packet command: `npm run release:host-kits`

That layer answers three separate questions:

1. Which repo-owned public bundle exists now?
2. Which official marketplace or registry surface exists in the host ecosystem?
3. Which of those surfaces has Prompt Switchboard actually published to?

## Canonical Skill Manifests

Actual repo-owned skill packets now carry a canonical `manifest.yaml` next to the
published `SKILL.md`.

- canonical schema: `skill-manifest.schema.json`
- current manifest-bearing skill packets:
  - `public-bundles/codex-bundle/skills/prompt-switchboard/manifest.yaml`
  - `public-bundles/openclaw-bundle/skills/prompt-switchboard/manifest.yaml`
- starter skill examples under `mcp/integration-kits/*.skill.prompt-switchboard.md.example`
  remain docs-only examples, not registry objects

These manifests are repo-owned truth packets. They help future registry or market
adapters stay aligned without pretending Prompt Switchboard is already listed on
an official skill marketplace.

Each publishable packet now also carries a repo-owned canonical `manifest.json`
next to the packet files so registry prep can stay machine-readable without
pretending publication already happened.

## Usage Pattern

1. Start the local Prompt Switchboard MCP sidecar.
2. Copy the relevant host example into your own config.
3. Replace `/absolute/path/to/multi-ai-sidepanel` with your clone path.
4. Keep client-side auth and config steps aligned with the official host docs.
5. Use `prompt-switchboard://builder/support-matrix` for host setup truth, `prompt-switchboard://builder/public-distribution` for listing truth, and `prompt-switchboard://sites/capabilities` for per-site DOM/readiness boundaries.
6. Keep the workflow honest:
   - smallest useful flow: `bridge_status -> check_readiness -> compare`
   - preferred full flow: add `analyze_compare`, then `run_workflow`, then the workflow follow-through calls

## Quick Placement Map

- Codex -> `config.toml`
- Claude Code -> `.mcp.json`
- OpenCode -> project-root `opencode.jsonc`
- OpenClaw -> `openclaw mcp set` or `mcp.servers`

## Official Host Docs

- Codex
  - https://developers.openai.com/codex/mcp
- Claude Code
  - https://docs.anthropic.com/en/docs/claude-code/mcp
- OpenCode
  - https://opencode.ai/docs/config
  - https://opencode.ai/docs/cli/
- OpenClaw
  - https://docs.openclaw.ai/cli/mcp

## OpenCode Starter Notes

- Save `opencode.jsonc.example` as a project-root `opencode.jsonc` inside your Prompt Switchboard clone.
- OpenCode's official MCP config model uses `mcp.<name>.type = "local"` plus a command array.
- Prompt Switchboard is still the MCP server in this flow; OpenCode remains the client.
- `opencode.skill.prompt-switchboard.md.example` is a lightweight starter instruction asset you can adapt into your own OpenCode rules or session notes.
- The repo-owned OpenCode packet is public-bundle-ready today, but an official published plugin package still requires owner-run publication.

## OpenClaw Starter Notes

- OpenClaw's official MCP docs expose two relevant paths:
  - `openclaw mcp serve` when OpenClaw itself should act as an MCP server
  - `openclaw mcp set <name> <json>` when OpenClaw should save an outbound MCP server definition
- Prompt Switchboard fits the second path here: OpenClaw keeps a saved MCP definition that launches the local Prompt Switchboard sidecar.
- `openclaw.skill.prompt-switchboard.md.example` is a starter workspace skill template you can adapt for an OpenClaw workspace.
- Treat the shipped OpenClaw files as public-bundle-ready packet assets, not as proof of a fully verified host lane or an already-published official listing in this repo.
