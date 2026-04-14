# Prompt Switchboard MCP Registry Submission Pack

This folder keeps the repo-owned submission materials for the official MCP
Registry lane.

In plain language: Prompt Switchboard already ships a real repo-owned MCP server.
The official MCP Registry already returns a live Prompt Switchboard MCP entry for the same governed integration surface.
The repo still stays extension-first and mixed-surface: the browser extension is
the main product doorway, and this registry packet is only one companion lane
for the governed MCP integration.

Treat this as a repo-owned registry support packet around the governed MCP integration. It
exists after the browser-first compare workspace is already clear; it is not the
first install or first-success doorway of the product.

## Current claim ladder

| Ladder step | Current status |
| --- | --- |
| `repo-owned prep exists` | yes |
| `public-ready package available` | no |
| `publicly discoverable listing live` | yes |
| `official marketplace listing live` | yes |

## Repo-owned submission materials

- [server.json](server.json)
- [../../../README.md](../../../README.md)
- [../../../docs/mcp-coding-agents.html](../../../docs/mcp-coding-agents.html)
- [../../../Dockerfile](../../../Dockerfile)
- [../../../mcp/server.ts](../../../mcp/server.ts)
- [../../../mcp/integration-kits/public-distribution-matrix.json](../../../mcp/integration-kits/public-distribution-matrix.json)

## What still belongs to later registry work

- an optional package-backed public install artifact for this governed MCP integration
- any metadata upgrade beyond the current websiteUrl-backed registry entry
- any extra host marketplace or browser-store publication beyond the live
  registry entry

Those are not repository-code blockers for the already-live registry entry.
