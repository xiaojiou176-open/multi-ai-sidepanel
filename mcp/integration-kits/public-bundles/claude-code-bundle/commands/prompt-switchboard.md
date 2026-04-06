# Prompt Switchboard

Use Prompt Switchboard when you want Claude Code to compare one prompt across
multiple supported AI chat tabs through the local Prompt Switchboard MCP
surface.

## Smallest useful flow

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`

## Preferred full flow

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`
4. `prompt_switchboard.analyze_compare`
5. `prompt_switchboard.run_workflow`
6. `prompt_switchboard.get_workflow_run`
7. `prompt_switchboard.list_workflow_runs`
8. `prompt_switchboard.resume_workflow`

## Boundary

- Prompt Switchboard remains the compare-first browser workspace.
- Claude Code remains the outer coding loop.
- This bundle assumes Claude Code already knows how to launch the local Prompt Switchboard MCP server.
