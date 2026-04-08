# Prompt Switchboard Compare Workflows Public Skill

This folder is the OpenHands/extensions-friendly and ClawHub-style public skill
packet for Prompt Switchboard.

## Purpose

Use it when you want one portable skill folder that keeps Prompt Switchboard's
public story honest:

- compare-first browser workflow first
- local MCP sidecar second
- no hosted relay claim
- no live marketplace claim without fresh read-back

## What this packet includes

- `SKILL.md`
  - the canonical compare-workflow instructions for host-side skill registries
- `manifest.yaml`
  - repo-owned listing metadata for ClawHub-style and OpenHands-style submits

## Best-fit hosts

- OpenHands/extensions contribution flow
- ClawHub-style skill publication
- repo-local skill import flows that expect a standalone folder

## What this packet must not claim

- no live OpenHands/extensions listing without fresh PR/read-back
- no live ClawHub listing without fresh host-side read-back
- no hosted Glama deployment, Docker catalog listing, or public relay claim
- no official MCP Registry listing by itself

## Source of truth

This folder is a public-facing derived packet. Keep it aligned with:

- `README.md`
- `docs/mcp-coding-agents.html`
- `server.json`

If the product boundary or MCP workflow changes, update this packet before
submitting it again.
