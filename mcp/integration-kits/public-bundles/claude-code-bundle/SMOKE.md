# Claude Code Bundle Smoke

1. Start the local sidecar with `npm run mcp:server`.
2. Attach the bundle MCP config inside Claude Code.
3. Call:
   - `prompt_switchboard.bridge_status`
   - `prompt_switchboard.check_readiness`
   - `prompt_switchboard.compare`
4. If the compare lane is healthy, continue with:
   - `prompt_switchboard.analyze_compare`
   - `prompt_switchboard.run_workflow`
