#!/usr/bin/env bash

# Prompt Switchboard public bundle packet for OpenClaw.
# This stays on the official `openclaw mcp set <name> <json>` path.

openclaw mcp set prompt_switchboard "$(cat <<'JSON'
{
  \"command\": \"npm\",
  \"args\": [
    \"--prefix\",
    \"/absolute/path/to/multi-ai-sidepanel\",
    \"run\",
    \"mcp:server\"
  ]
}
JSON
)"
