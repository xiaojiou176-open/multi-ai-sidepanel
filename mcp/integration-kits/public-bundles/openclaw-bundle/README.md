# Prompt Switchboard OpenClaw Bundle

This is the repo-owned public OpenClaw bundle packet for Prompt Switchboard.

It is meant for:

- OpenClaw users who want one packable Prompt Switchboard MCP packet
- maintainers who need a truthful bridge between the repo-owned OpenClaw starter
  assets and any later official listing work

## What the bundle includes

- `openclaw.prompt-switchboard.json`
- `mcp.servers.json`
- `openclaw.mcp.set.sh`
- `.codex-plugin/plugin.json`
- `skills/prompt-switchboard/SKILL.md`
- `SMOKE.md`

## Truth boundary

- Prompt Switchboard stays the local MCP server and browser-side product surface
- OpenClaw stays the outer coding loop
- this bundle is not an official marketplace or registry listing
- this bundle is not a hosted service or SDK

## Placement

- fastest current path:
  - run `openclaw mcp set prompt_switchboard "$(cat openclaw.prompt-switchboard.json)"`
- alternative path:
  - copy `mcp.servers.json` into an OpenClaw config that already consumes
    `mcp.servers`

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
