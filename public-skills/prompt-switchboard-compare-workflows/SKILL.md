---
name: prompt-switchboard-compare-workflows
description: Use this public skill when you want Prompt Switchboard's compare-first browser workflow through the local MCP sidecar without overclaiming a hosted relay or a live marketplace listing.
version: 1.0.0
---

# Prompt Switchboard Compare Workflows

## Purpose

Help a host, plugin registry, or collaborator consume Prompt Switchboard as a
compare-first browser workspace without rewriting it into a hosted AI platform.

## Keep this identity first

- Browser-native compare workspace first
- Local MCP sidecar for builder lanes second
- No hosted relay
- No public HTTP API
- No “already listed everywhere” claim

## Preferred flow

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`
4. `prompt_switchboard.analyze_compare`
5. `prompt_switchboard.run_workflow`

## Proof path

1. Install the latest release zip
2. Run one real compare from the side panel
3. Verify the MCP sidecar can read readiness and compare state
4. Keep the first success path local and inspectable

## Truth language

- Good: "repo-owned public skill packet"
- Good: "compare-first local MCP workflow skill"
- Forbidden: "officially listed skill" without fresh host-side read-back
- Forbidden: "hosted Prompt Switchboard platform"
