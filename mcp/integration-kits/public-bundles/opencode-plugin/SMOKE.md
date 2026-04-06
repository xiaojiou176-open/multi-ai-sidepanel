# OpenCode Packet Smoke

1. Start the local sidecar with `npm run mcp:server`.
2. Save `opencode.jsonc` as your project-root OpenCode config.
3. If you want the helper tool inside OpenCode, use the local plugin file or a packed npm artifact.
4. Call:
   - `prompt_switchboard.bridge_status`
   - `prompt_switchboard.check_readiness`
   - `prompt_switchboard.compare`
