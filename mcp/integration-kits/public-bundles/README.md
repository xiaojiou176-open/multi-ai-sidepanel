# Prompt Switchboard Public Bundles

These directories are the repo-owned public distribution packets for Prompt
Switchboard host setup.

They are intentionally stronger than the raw starter snippets under
`mcp/integration-kits/`:

- each packet keeps config, placement, smoke proof, and truthful support notes together
- each packet is packable through `npm run release:host-kits`
- each packet keeps public-bundle truth separate from official marketplace or registry truth

## Included packets

- `codex-bundle/`
  - packable Codex bundle with `.codex-plugin`, `.mcp.json`, and a compare-first skill
- `claude-code-bundle/`
  - packable Claude bundle with `.claude-plugin`, `.mcp.json`, and command content
- `opencode-plugin/`
  - publish-ready OpenCode plugin scaffold plus local MCP config and smoke notes
- `openclaw-bundle/`
  - packable OpenClaw bundle with MCP registry JSON, `mcp.servers` fragment, install helper, and smoke notes

## What these packets are not

- not proof of a live marketplace listing
- not proof of a published npm package
- not a hosted relay
- not a public SDK

## Current truthful split

- Codex and Claude Code:
  - strongest repo-specific host bindings
  - public bundle packet shipped now
  - no official Prompt Switchboard marketplace listing verified from current official docs
- OpenCode:
  - official plugin surface exists
  - this repo now ships a publish-ready plugin scaffold
  - no published npm package yet
- OpenClaw:
  - official CLI MCP setup is documented
  - this repo now ships a packable OpenClaw bundle packet
  - no official Prompt Switchboard listing is verified from the checked OpenClaw docs

## Build the local artifacts

```bash
npm run release:host-kits
```

That command writes packable artifacts and a local manifest under
`dist/public-bundles/`.

Treat `dist/public-bundles/` as the only canonical local artifact output for
these packets.

- root-level `prompt-switchboard-*.tgz` files are disposable leftovers, not the
  supported artifact surface
- regenerate packets with `npm run release:host-kits` instead of carrying loose
  tarballs in the repo root
