# CLAUDE

This file mirrors the public AI-maintainer guidance for this repository.

## Repository Intent

Prompt Switchboard is a browser extension that fans one prompt out to multiple
supported AI chat websites and shows the replies in one side panel.

## Public Repository Rules

- Keep the tracked public surface small and English-only.
- Keep governance, maintenance, and tooling files in English.
- Non-English content is only allowed for product localization resources and
  third-party DOM compatibility selectors.
- Do not add inward-facing operational logs or governance notes.
- Do not track caches, runtime outputs, local plans, or log files.
- Keep support and security wording aligned with `README.md` and `SECURITY.md`.

## Minimal Verification

For release-sensitive work, keep the repo-side baseline green:

```bash
npm run secrets:scan:history
npm run test:ci
npm run clean:runtime && npm run test:e2e:shell
```

Treat host-side verification as a separate live-repository check:

```bash
npm run verify:host-actions-policy
npm run verify:host-security
npm run verify:host-frontdoor
npm run verify:host-release-proof
```
