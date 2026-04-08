# Prompt Switchboard OpenCode Plugin Packet

This directory is the repo-owned public OpenCode packet for Prompt Switchboard.

It does two things:

- keeps the current MCP config shape and compare-first smoke loop in one place
- provides a publish-ready npm plugin scaffold that can print the same bootstrap
  guidance from inside OpenCode

## Truth boundary

- OpenCode already has an official npm plugin surface
- this repo now ships a publish-ready package scaffold
- the package is not published yet
- Prompt Switchboard stays the local MCP server and browser-side product surface

## Public install shape

- current repo-owned packet:
  - `manifest.json`
  - `opencode.jsonc`
  - `plugin.js`
  - `SMOKE.md`
- official listing path later:
  - publish this package to npm
  - add the package name to the OpenCode `plugin` array

## Smallest useful smoke

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`
