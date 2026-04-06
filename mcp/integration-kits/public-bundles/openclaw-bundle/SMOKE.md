# OpenClaw Smoke

Use this packet only after the local Prompt Switchboard sidecar is healthy.

## Smallest useful flow

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`

## Preferred full flow

1. `prompt_switchboard.analyze_compare`
2. `prompt_switchboard.run_workflow`
3. `prompt_switchboard.get_workflow_run`
4. `prompt_switchboard.list_workflow_runs`
5. `prompt_switchboard.resume_workflow`
