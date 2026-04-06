# Security Policy

## Scope

Security fixes are applied on a best-effort basis to the latest code on the
default branch first.

This repository contains browser extension code, DOM automation logic for
supported third-party AI websites, and optional remote selector update support.

Prompt Switchboard keeps the trust boundary local-first: it relies on the
user's existing browser sessions and does not add a hosted relay service in
front of those supported sites.

## Reporting a Vulnerability

Do **not** post exploit details, secrets, tokens, cookies, private keys,
account data, or personal data in a public issue.

The repository does not currently publish a dedicated private security email
address. Use this order instead:

1. Use GitHub private vulnerability reporting if it is enabled for this repository.
2. If that private channel is unavailable, open a minimal public issue without sensitive details.
3. Ask for a private handoff before sharing any proof of concept or exploit material.

## What to Include

- a short summary of the issue
- affected files or features
- reproduction steps
- impact
- any mitigation already confirmed

## Maintainer Checks

Maintainers should periodically re-run:

```bash
npm run secrets:scan:history
npm run verify:host-security
```

The first command keeps the history-layer secret audit honest. The second
checks GitHub host-side protections through `gh`, including the current private
vulnerability-reporting path and related repository security settings.

## Verification Boundary

`npm run verify:host-security` is the repeatable host-security gate for this
repository, but it does not replace every manual review step.

Maintainers should still manually confirm:

- the GitHub private vulnerability reporting entrypoint is visible in the live
  repository UI
- `SECURITY.md` is still the public handoff path referenced by templates and
  public docs
- the latest GitHub release page and attached assets do not contradict current
  security or support wording

## Current Limits

- This repository does not advertise a dedicated private security mailbox.
- Git history was rewritten on March 24, 2026 to remove earlier browser DOM capture commits.
- Older off-repo clones, cached archives, or downloaded bundles created before that rewrite can still exist outside this repository.

## Sensitive Material

Never include:

- secrets
- tokens
- cookies
- session material
- private keys
- personal data
- third-party account details
