# Prompt Switchboard Codex Bundle

This is the repo-owned public bundle packet for Codex.

It is meant for:

- Codex users who want a public, compare-first Prompt Switchboard setup packet
- bundle-compatible consumers such as OpenClaw that can ingest Codex-format packs

## What the bundle includes

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `manifest.json`
- `skills/prompt-switchboard/SKILL.md`
- `SMOKE.md`

## Truth boundary

- Prompt Switchboard stays the local MCP server and browser-side product surface
- Codex stays the outer coding loop
- this bundle is not a marketplace listing
- this bundle is not a hosted service or SDK

## Placement

- for Codex itself:
  - use the packet as a reference bundle and copy the MCP block into your `config.toml`
- for OpenClaw:
  - install the packed archive through the official OpenClaw bundle path

## Smallest useful smoke

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`

## Full follow-through

1. `prompt_switchboard.analyze_compare`
2. `prompt_switchboard.run_workflow`
3. `prompt_switchboard.get_workflow_run`
4. `prompt_switchboard.list_workflow_runs`
5. `prompt_switchboard.resume_workflow`
