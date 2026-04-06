# Native Messaging Scaffold

Prompt Switchboard does **not** ship Chrome Native Messaging as the active
runtime transport in this release.

The shipped path today is:

- external agent -> MCP sidecar over `stdio`
- MCP sidecar -> extension over the localhost loopback bridge

This folder exists so future experiments can start from an explicit scaffold
instead of reopening the transport question from scratch.

## What is in scope here

- a host manifest template
- a local helper that renders the manifest to the user-level install path
- repo-owned notes about why this is a scaffold, not an active runtime path

## What is intentionally **not** shipped here

- no `nativeMessaging` permission in the current extension manifest
- no `chrome.runtime.connectNative()` wiring in the active background runtime
- no claim that this release already uses Native Messaging

## Why this stays a scaffold

Chrome Native Messaging requires host registration outside the repository:

- the native host manifest must be written to an OS-specific location
- the manifest must point to an absolute executable path
- the manifest must include the real extension ID in `allowed_origins`
- Windows also requires registry entries

Those are valid future hardening steps, but they are not repo-only actions.

## Helper

Use the scaffold helper when you want to render a manifest without pretending
the current release is already wired to use it:

```bash
node scripts/mcp/native-messaging-manifest.mjs \
  --extension-id=<chrome-extension-id> \
  --host-path=/absolute/path/to/native-host \
  --browser=chrome \
  --dry-run
```

Add `--write` if you want the helper to create the user-level manifest file on
macOS or Linux.

The helper is intentionally conservative:

- it defaults to `--dry-run`
- it only writes user-level manifests
- it refuses non-absolute host paths
- it prints next actions instead of claiming the transport is already enabled
