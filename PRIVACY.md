# Privacy Policy

## What Prompt Switchboard Does

Prompt Switchboard is a browser extension that helps you send one prompt to
multiple supported AI chat websites from a single side panel.

The extension is **local-first** and **compare-first**:

- it runs in your browser
- it uses your existing browser login state for supported sites
- it does not include a hosted backend for prompt execution

## Data the Extension Stores

The extension stores data in Chrome storage on the local machine:

- session history
- selected models
- local settings
- cached selector configuration
- lightweight runtime mappings such as tab references

The current storage split is:

- `chrome.storage.local` for persistent sessions, settings, schema metadata, and cached selectors
- `chrome.storage.session` for transient runtime state

## What the Extension Sends Over the Network

Prompt content is sent directly to the supported AI chat websites that you
choose to open and use.

The extension may also fetch optional selector override configuration from a URL
configured through `VITE_SELECTOR_CONFIG_URL`.

The repository itself does **not** provide:

- a hosted relay service
- an account management backend
- a prompt storage API

It also does **not** ship telemetry beacons, session replay tooling, ad-tech
SDKs, or a hosted analytics collector inside this repository build.

## Third-Party Services

When you use Prompt Switchboard, your prompt and the resulting responses are
handled by the third-party AI websites you selected, under those services'
terms and privacy policies.

Current supported site families include:

- ChatGPT
- Gemini
- Perplexity
- Qwen
- Grok / xAI

## Authentication Boundary

The extension depends on your existing browser login sessions.

It does not bypass authentication, mint credentials, or create managed
accounts on your behalf.

## Permissions

The extension currently requests:

- `sidePanel`
- `activeTab`
- `scripting`
- `tabs`
- `storage`

It also requests host access for supported AI chat sites and for
`https://raw.githubusercontent.com/*` when optional remote selector updates are
enabled, plus `http://127.0.0.1:48123/*` for the optional local MCP bridge.

## Data Sharing and Selling

This repository does not implement a data broker, ad platform, or hosted prompt
analytics service.

If a future public distribution channel requires additional privacy disclosures,
those disclosures should extend this document rather than replace its local-first
runtime boundary.

## Security and Support

For security-sensitive issues, follow [`SECURITY.md`](./SECURITY.md).

For general non-sensitive support requests, use the public issue tracker:

`https://github.com/xiaojiou176-open/multi-ai-sidepanel/issues`
