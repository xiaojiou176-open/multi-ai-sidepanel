# Prompt Switchboard MCP Registry Submission Pack

This folder keeps the repo-owned submission materials for the official MCP
Registry lane.

In plain language: Prompt Switchboard already ships a real local MCP sidecar and
public builder docs, but an official registry listing is still an external
publish step until a public artifact path and registry authentication are
confirmed.

## Current claim ladder

| Ladder step | Current status |
| --- | --- |
| `repo-owned prep exists` | yes |
| `public-ready package available` | no |
| `publicly discoverable listing live` | no |
| `official marketplace listing live` | no |

## Repo-owned submission materials

- [server.json](server.json)
- [../../../README.md](../../../README.md)
- [../../../docs/mcp-coding-agents.html](../../../docs/mcp-coding-agents.html)
- [../../../Dockerfile](../../../Dockerfile)
- [../../../mcp/server.ts](../../../mcp/server.ts)
- [../../../mcp/integration-kits/public-distribution-matrix.json](../../../mcp/integration-kits/public-distribution-matrix.json)

## What still blocks a live registry entry

- registry authentication
- a confirmed public artifact or accepted generic install path for this sidecar
- the external publish step itself

Those are not repository-code blockers.
