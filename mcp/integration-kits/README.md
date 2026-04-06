# Prompt Switchboard Integration Kits

These files are **repo-shipped starter kits** for the strongest current
Prompt Switchboard host bindings.

They are intentionally narrow:

- local MCP sidecar only
- no hosted relay
- no public HTTP API
- no general-purpose SDK claim

Use them as editable starting points, not as magical one-click installers.

## Included Kits

- `codex.config.toml.example`
  - starter snippet for Codex MCP configuration
- `claude.mcp.json.example`
  - starter snippet for Claude Code MCP configuration
- `codex.skill.prompt-switchboard.md.example`
  - starter skill prompt for Codex sessions that want a compare-first MCP loop
- `claude.skill.prompt-switchboard.md.example`
  - starter skill prompt for Claude Code sessions that want the same compare-first flow
- `opencode.jsonc.example`
  - project-root OpenCode MCP starter for Prompt Switchboard
- `openclaw.prompt-switchboard.json.example`
  - JSON payload you can register with `openclaw mcp set`
- `openclaw.mcp.servers.json.example`
  - config fragment for OpenClaw-managed `mcp.servers`
- `openclaw.mcp.set.example.sh`
  - shell helper showing the exact OpenClaw CLI registration path
- `opencode.skill.prompt-switchboard.md.example`
  - starter instruction template for OpenCode sessions
- `openclaw.skill.prompt-switchboard.md.example`
  - starter workspace-skill template for OpenClaw sessions
- `support-matrix.json`
  - machine-readable support matrix for supported, partial, starter-kit-only, and planned bindings
- `public-distribution-matrix.json`
  - machine-readable truth for public bundle surfaces, official host surfaces, and listing boundaries

## Current Truth By Host

| Host | Current truth | Repo-owned asset | Where it goes |
| --- | --- | --- | --- |
| Codex | strongest repo-specific host binding | `codex.config.toml.example` | paste into the Codex MCP server section in your `config.toml` |
| Claude Code | strongest repo-specific host binding | `claude.mcp.json.example` | paste into your Claude Code MCP config such as `.mcp.json` |
| OpenCode | starter-kit only through generic MCP client config | `opencode.jsonc.example`, `opencode.skill.prompt-switchboard.md.example` | save as project-root `opencode.jsonc` in your Prompt Switchboard clone |
| OpenClaw | starter-kit only through generic MCP registry / serve path | `openclaw.prompt-switchboard.json.example`, `openclaw.mcp.servers.json.example`, `openclaw.mcp.set.example.sh`, `openclaw.skill.prompt-switchboard.md.example` | register with `openclaw mcp set` or drop the definition under `mcp.servers` |

## What These Kits Are Not

- not a plugin marketplace package
- not a browser automation framework
- not a second protocol surface beyond MCP

## Public Distribution Truth

- The public builder-bundle and listing truth lives on [`docs/public-distribution-matrix.html`](../../docs/public-distribution-matrix.html).
- The machine-readable version of that split lives in `public-distribution-matrix.json`.
- Shipping a public bundle does not mean Prompt Switchboard is already listed on an official marketplace or registry for that host.

## Public Distribution Layer

- public truth page:
  - `docs/public-distribution-matrix.html`
- host packet page:
  - `docs/mcp-host-packets.html`
- machine-readable distribution truth:
  - `mcp/integration-kits/public-distribution-matrix.json`
- bundle packet directories:
  - `mcp/integration-kits/public-bundles/`
- release-ready packet command:
  - `npm run release:host-kits`

Use this layer when you need to answer three separate questions honestly:

1. Which repo-owned public bundle exists now?
2. Which official marketplace or registry surface exists in the host ecosystem?
3. Which of those surfaces has Prompt Switchboard actually published to?

## Required Local Assumptions

- Prompt Switchboard sidecar runs locally over `stdio`
- the browser extension is loaded in the same machine/browser profile
- the loopback bridge stays local on `127.0.0.1`

## Usage Pattern

1. Start the local sidecar with the normal maintainer path.
2. Copy the relevant example into your own host config.
3. Adjust the absolute repository path if your clone lives elsewhere.
   - Use `/absolute/path/to/multi-ai-sidepanel` as the placeholder to replace.
4. Keep client-side auth/config steps aligned with the official host docs for that client.
5. Use `support-matrix.json` when you want the machine-readable truth source instead of prose alone.
   - It now includes support tiers, official docs, starter assets, and per-host placement hints.
6. Use `public-distribution-matrix.json` when you need the public truth split between:
   - official host surface exists
   - repo-owned Prompt Switchboard bundle ships now
   - actual official listing or registry publication already happened
7. Use `prompt-switchboard://builder/support-matrix` for host setup truth, `prompt-switchboard://builder/public-distribution` for public bundle truth, and `prompt-switchboard://sites/capabilities` for per-site DOM/readiness/private-API boundary notes.
8. After setup, keep the workflow lane honest:
   - smallest useful flow: `bridge_status -> check_readiness -> compare`
   - preferred full flow: add `analyze_compare`, then `run_workflow`, then `get_workflow_run` / `list_workflow_runs` / `resume_workflow` when you want staged follow-through

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

## OpenClaw Starter Notes

- OpenClaw's official MCP docs expose two relevant paths:
  - `openclaw mcp serve` when OpenClaw itself should act as an MCP server
  - `openclaw mcp set <name> <json>` when OpenClaw should save an outbound MCP server definition
- Prompt Switchboard fits the second path here: OpenClaw keeps a saved MCP definition that launches the local Prompt Switchboard sidecar.
- `openclaw.skill.prompt-switchboard.md.example` is a starter workspace skill template you can adapt for an OpenClaw workspace.
- Treat the shipped OpenClaw files as starter-kit assets, not as proof of a fully verified host lane in this repo.
