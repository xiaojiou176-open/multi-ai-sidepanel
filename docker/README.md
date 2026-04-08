# Prompt Switchboard Docker Surface

This directory documents the repo-owned Docker entry for the local Prompt
Switchboard MCP sidecar and operator helper.

- runtime entrypoint: root `Dockerfile`
- healthcheck: `docker/healthcheck.mjs`
- public builder-facing doc: `docs/mcp-docker-sidecar.html`

Truth boundary:

- local MCP sidecar helper only
- not a hosted compare service
- not a public HTTP API
- not proof of a Glama listing or official registry publication

Exact local commands:

- `docker build -t prompt-switchboard-mcp .`
- `docker run --rm -i -p 48123:48123 prompt-switchboard-mcp server`
- `docker run --rm prompt-switchboard-mcp doctor`

Glama or other registry/listing submission remains an owner-run external step.
