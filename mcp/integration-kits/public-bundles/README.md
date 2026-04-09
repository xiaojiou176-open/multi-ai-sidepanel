# Prompt Switchboard Public Bundles

These directories are the repo-owned public distribution packets for Prompt
Switchboard host setup.

They stay in the second ring. The first reviewer question is still whether the
browser extension can run one honest compare turn; these bundles only carry that
workflow into host-specific setup paths after the browser product path is clear.

They are intentionally stronger than the raw starter snippets under
`mcp/integration-kits/`:

- each packet keeps config, placement, smoke proof, and truthful support notes together
- each packet now carries a canonical `manifest.json` for repo-owned registry prep
- each packet is packable through `npm run release:host-kits`
- each packet keeps public-bundle truth separate from official marketplace or registry truth

## Included packets

- `codex-bundle/`
  - companion Codex starter bundle with `.codex-plugin`, `.mcp.json`, and a compare-first skill
- `claude-code-bundle/`
  - companion Claude Code starter bundle with `.claude-plugin`, `.mcp.json`, and command content
- `opencode-plugin/`
  - repo-owned OpenCode starter scaffold plus local MCP config and smoke notes
- `openclaw-bundle/`
  - repo-owned OpenClaw starter bundle with MCP registry JSON, `mcp.servers` fragment, install helper, and smoke notes

## What these packets are not

- not proof of a live marketplace listing
- not proof of a published npm package
- not a hosted relay
- not a public SDK

## Current truthful split

- Codex and Claude Code:
  - strongest repo-specific host bindings
  - public bundle packets ship now as companion carry-forward surfaces
  - no official Prompt Switchboard marketplace listing verified from current official docs
- OpenCode:
  - this repo now ships a repo-owned starter scaffold
  - no published npm package yet
- OpenClaw:
  - repo-owned OpenClaw starter bundle ships now
  - no official Prompt Switchboard listing is verified from the checked OpenClaw docs

No bundle in this directory outranks the browser extension, the first compare
path, or the public skill packet in first-impression ordering.

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
