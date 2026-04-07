# Contributing

## Project Shape

This repository contains the Prompt Switchboard browser extension:

- side panel UI
- background service worker
- content scripts
- per-site scrapers
- local Chrome storage persistence

## Development Setup

```bash
npm install
npm run dev
```

Build the unpacked extension with:

```bash
npm run build
```

Load `dist` in `chrome://extensions` with Developer Mode enabled.

## MCP Sidecar

The repository also ships a local Prompt Switchboard MCP sidecar.

Use these commands:

```bash
npm run mcp:doctor
npm run mcp:server
npm run test:mcp:smoke
```

Current transport model:

- external MCP clients connect to the sidecar over `stdio`
- the sidecar talks to the extension over a localhost loopback bridge on `127.0.0.1`
- the bridge exposes Prompt Switchboard product actions only
- start the sidecar before opening or reloading the extension runtime if you want the bridge to attach immediately

This is intentionally narrower than generic browser automation and lighter-weight than Chrome Native Messaging host registration.
Native Messaging is not wired into the current release path; the repo only ships
the loopback bridge today. If you want to prepare a future Native Messaging
experiment, start from `mcp/native-messaging/README.md` and the scaffold helper
under `scripts/mcp/native-messaging-manifest.mjs`.

## Host Safety Boundary

Prompt Switchboard must not grow OS-level desktop automation or host-wide
process cleanup paths as part of its supported runtime.

That means this repo should not introduce:

- `killall`, `pkill`, broad `kill -9`, or raw `process.kill(...)`
- `osascript`, `System Events`, or Force Quit / `loginwindow` control paths
- recovery flows that try to reclaim the whole machine instead of failing
  closed around the repo-owned browser lane

Keep the live/browser path browser-owned:

- repo-owned Chrome profile resolution
- repo-owned CDP identity and attach checks
- explicit blockers instead of hidden host cleanup

Run the host-safety gate before shipping changes that touch scripts, browser
verification helpers, or maintainer automation:

```bash
npm run verify:host-safety
```

If you are documenting or extending the current builder-facing contract, keep
these as the primary entrypoints:

- `mcp/server.ts` for the public MCP tool/resource surface
- `src/bridge/protocol.ts` for the shared command and payload contract
- `src/substrate/api/contracts.ts` for the typed action/result contract
- `mcp/integration-kits/` for the repo-shipped Codex / Claude Code strongest host kits plus the OpenCode / OpenClaw public-bundle-ready packets and generic MCP starter assets
- `docs/mcp-coding-agents.html` for the public-facing explanation of the MCP
  builder surface

If you are exercising the optional local Switchyard runtime-backed analyst lane,
keep the current default local service URL explicit:

```bash
http://127.0.0.1:4317
```

That lane is maintainer-local / partial. It does not replace the browser-tab
compare lane, and it should be described as an analyst-only execution surface
unless fresh live evidence proves a wider runtime-backed path.

## Repo Disk Hygiene

Use these repo-local maintenance commands when you want to audit or reduce the
working-copy footprint without touching shared host caches:

```bash
npm run audit:disk:repo
npm run clean:runtime:dry-run
npm run clean:repo:light
npm run clean:repo:heavy
```

Command boundary:

- `clean:runtime:dry-run` previews the current runtime cleanup plan
- `clean:runtime` removes disposable runtime outputs immediately, removes
  repo-owned external cache entries under `~/.cache/multi-ai-sidepanel/`
  (including `live-profile-clones/prompt-switchboard-live-*`), prunes them with
  the current TTL/cap policy, and applies retention to local evidence
  directories, while preserving the repo-owned browser root under
  `~/.cache/multi-ai-sidepanel/browser/chrome-user-data/`
- `clean:repo:light` only removes `dist`, `coverage`, and `.husky/_`
- `clean:repo:heavy` runs the light cleanup set and also removes `node_modules`

Runtime classes:

- `.runtime-cache/marketing-user-data` and `.runtime-cache/marketing-frames` ->
  disposable-generated
- `.runtime-cache/test_output`, `.runtime-cache/coverage-tmp`,
  `.runtime-cache/coverage-split`, and `.runtime-cache/test-results` ->
  scratch / disposable-generated
- `~/.cache/multi-ai-sidepanel/live-profile-clones/prompt-switchboard-live-*`
  -> repo-owned external disposable-generated temp clone created by
  login-state-sensitive live flows when profile cloning is enabled
- `~/.cache/multi-ai-sidepanel/` -> repo-owned external cache root with
  automatic retention (`72h`) and size cap (`2 GB`) unless overridden by
  repo-owned cache env vars
- `~/.cache/multi-ai-sidepanel/browser/chrome-user-data/` ->
  repo-owned persistent browser state; excluded from TTL/cap pruning and
  excluded from `clean:runtime`
- `.runtime-cache/release` -> evidence_keep with retention: keep the newest
  local release artifacts and prune copies older than the 72-hour TTL
- `.runtime-cache/live-site-runs` and `.runtime-cache/live-attach` ->
  evidence_keep with retention: keep the newest local live-proof evidence and
  prune copies older than the 72-hour TTL
- `.runtime-cache/prompt*-release-preview` -> evidence_keep with retention:
  keep the newest local preview collections and prune aged copies older than
  the 72-hour TTL

Keep these defaults:

- preserve `.agents` local collaboration history by default
- preserve `.git` metadata and `docs/assets` tracked public assets
- do not treat shared host caches such as `~/.npm` or
  `~/Library/Caches/ms-playwright/` as repo-local cleanup targets
- do not treat real browser profile roots such as
  `~/Library/Application Support/Google/Chrome` as repo-local cleanup targets
- do not treat generic system browser residue such as
  `com.google.Chrome.code_sign_clone` as repo-native cleanup targets; record it
  as surrounding machine state instead of deleting it from this repo

Treat `clean:repo:heavy` as a dehydrating step for the workspace. Rehydrate with:

```bash
npm install
npm run build
```

## Front-Door Assets

The tracked landing page and README visuals live under `docs/` and should stay
aligned with the real product surface.

Use [`docs/frontdoor-metadata.json`](./docs/frontdoor-metadata.json) as the
single source of truth for public-facing product metadata before editing README,
landing-page SEO tags, manifest description, or GitHub front-door settings.

Refresh the tracked screenshots, GIF, and social preview with:

```bash
npm run marketing:assets
```

Build the versioned extension zip that will later be attached to GitHub Releases with:

```bash
npm run release:bundle
npm run release:sbom
```

If you need a reviewable artifact bundle in GitHub without regenerating it
locally, trigger the `Marketing Assets Preview` workflow.

## Local Guard Setup

For the full local guard, install:

```bash
uv tool install pre-commit
brew install gitleaks git-secrets
```

Then initialize repo-local `git-secrets` rules:

```bash
npm run secrets:setup
```

Husky is the Git hook entrypoint. The versioned `.pre-commit-config.yaml`
remains the documented hook contract.

## Verification Layers

Treat Prompt Switchboard as a five-layer verification repo:

| Layer | What it owns | Default command |
| --- | --- | --- |
| `pre-commit` | fast hygiene, root allowlist, host safety, sensitive-surface, placebo guard, brand guard | `git commit` runs the hook automatically, or use `npm run test:pre-commit` / `npm run precommit:run` to replay it |
| `pre-push` | deterministic fast repo gate before sharing work; heavier packet/docs drift checks stay off this local default lane | `npm run test:pre-push` |
| `hosted` | GitHub-hosted reproduction of the default repo verification pack | `npm run test:hosted` |
| `nightly` | heavier deterministic audits that should stay off the normal local push path | `npm run test:nightly` |
| `manual` | login-state-sensitive live proof, host-side GitHub truth, release closure, marketing captures, and store packets | see the manual wrapper commands below |

The fast local contract before a pull request is:

```bash
npm run test:pre-commit
npm run verify:sensitive-surface
npm run test:pre-push
```

## CI Boundary

Official CI for this repository runs on GitHub Hosted runners
(`ubuntu-latest`). Local `npm run test:hosted` is the developer-side
reproduction path for that hosted workflow. `npm run test:ci` is a compatibility
alias of the same hosted lane.

Keep deterministic shell E2E isolated from the real Chrome login-state lane:

- `tests/e2e/extension.spec.ts` should continue using repo-owned scratch
  profiles under `.runtime-cache/playwright-user-data/...`
- shared Playwright browser downloads under `~/Library/Caches/ms-playwright/`
  are visible in audits but are never auto-cleaned by Prompt Switchboard
- login-state-sensitive live flows stay outside default CI because they require
  a human-seeded browser profile

Keep the manual lane separate from the default local and hosted paths. Use the
wrapper commands first, then drop to the narrower single-purpose commands only
when you need one specific manual proof:

```bash
npm run test:manual:host
npm run test:manual:live
npm run test:manual:release
npm run test:manual:assets
```

If you need a narrower manual packet instead of the wrapper, use:

```bash
npm run verify:host:doctor
npm run verify:host:pack
npm run verify:host-sensitive-surface
npm run verify:host-release-proof
npm run verify:release-baseline
npm run verify:release-closure
npm run clean:runtime
npm run marketing:assets
```

Use the clean-first shell E2E path when you change extension shell behavior,
settings flow, or browser integration paths. The shell proof path now starts
from a clean runtime cache and preserves failure artifacts if the suite fails.

Treat `verify:host-security` and `verify:host-frontdoor` as host-side checks
for the live GitHub repository surface. They are not interchangeable with the
repo-side machine gate and require GitHub authentication in local maintenance
flows or an explicit token in GitHub Actions.

Treat `verify:sensitive-surface` as the repo-side privacy guard for tracked
content and maintainer-facing reports. It blocks maintainer-local absolute
paths, tracked log/runtime artifacts, private-key markers, credential-like
tokens, and raw `promptPreview` / `bodyPreview` output before those leaks land
in commits or release prep.

Use `npm run verify:host:pack` as the default host-surface bundle for:

- `verify:host-actions-policy`
- `verify:host-security`
- `verify:host-sensitive-surface`
- `verify:host-frontdoor`

Run `npm run verify:host:doctor` first when you are unsure whether the local
shell has the right GitHub CLI and token prerequisites for the host-side checks.

Treat `verify:host-actions-policy` and `verify:host-release-proof` as additional
host-side truth checks:

- `verify:host-actions-policy` confirms the repository-level GitHub Actions
  policy is hardened instead of relying on workflow discipline alone.
- `verify:host-release-proof` confirms the latest public release exposes the
  expected proof assets, not just the repo-side generation steps.

Use `verify:release-baseline` before a public release, and refresh
`marketing:assets` when the public-facing product visuals change.
Use `verify:release-closure` after the release is published to confirm the live
GitHub surface still matches the repo contract.

Nightly repo audits should be deterministic but heavier than the default local
push path. The current nightly pack is:

```bash
npm run test:nightly
```

That nightly lane keeps shell E2E, full history secret scans, integration-kit
packet packing, store-readiness, and release-ready host packets off the normal
pre-push path without deleting the checks.

Treat `npm run test:live` as a maintainer-local Tier C proof path. It is
intentionally not part of the public GitHub workflow surface because it depends
on a real logged-in browser profile.

Use the live preflight helper before you try the real run:

```bash
npm run test:live:doctor
npm run test:live:probe
npm run test:live:diagnose
npm run test:live:support-bundle
npm run test:live
```

The doctor reports which env vars are missing, whether the browser profile path
exists, whether `Local State` and the requested profile directory are present,
and which extension build path will be used.

The canonical login-state live lane now uses the repo-owned persistent browser
root via environment-driven resolution:

- default runtime root:
  `~/.cache/multi-ai-sidepanel/browser/chrome-user-data`
- default runtime profile name:
  `multi-ai-sidepanel`
- default runtime profile directory:
  `Profile 1`

All login-state-sensitive live commands fail closed when that real Chrome
profile cannot be resolved. They do not fall back to a shared Chromium
`Default` profile.

Bootstrap that persistent browser root once before using the canonical lane:

```bash
npm run test:live:bootstrap-profile
```

The bootstrap command:

- expects all real Chrome / Chromium / Chrome for Testing processes to be
  closed first
- copies the source `Local State` plus the source `multi-ai-sidepanel` profile
  from the default Chrome root
- rewrites the target root to a single canonical `Profile 1`
- removes `SingletonLock`, `SingletonCookie`, and `SingletonSocket` from the
  new root

The default bootstrap source is:

- `PROMPT_SWITCHBOARD_BROWSER_SOURCE_USER_DATA_DIR=~/Library/Application Support/Google/Chrome`
- `PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_NAME=multi-ai-sidepanel`

The same clone controls also apply to the repo-owned diagnosis ladder when you
need a deterministic persistent-context troubleshooting pass without touching
the canonical real Chrome attach lane:

```bash
PROMPT_SWITCHBOARD_LIVE=1 PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE=persistent PROMPT_SWITCHBOARD_CLONE_PROFILE=1 npm run test:live:probe
PROMPT_SWITCHBOARD_LIVE=1 PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE=persistent PROMPT_SWITCHBOARD_CLONE_PROFILE=1 npm run test:live:diagnose
PROMPT_SWITCHBOARD_LIVE=1 PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE=persistent PROMPT_SWITCHBOARD_CLONE_PROFILE=1 npm run test:live:support-bundle
```

The maintainer-local live ladder is now:

- `test:live:doctor`: preflight the browser/profile/build lane
- `test:live:probe`: inspect supported-site page state in the active live profile
- `test:live:diagnose`: compress the current page truth into blocker + next-action output
- `test:live:support-bundle`: capture screenshots, HTML, text, and diagnosis into `.runtime-cache/live-site-runs/`

If you are validating the optional local Switchyard runtime-backed analyst lane,
use the dedicated maintainer probe after the local Switchyard service is up:

```bash
npm run test:switchyard-runtime:probe
```

The probe defaults to `Gemini` because that is the current lowest-friction
runtime-backed analyst proof path when a local Switchyard BYOK service is
available.

The supported default login-state live-proof path is now:

- repo-owned persistent browser user data dir:
  `~/.cache/multi-ai-sidepanel/browser/chrome-user-data`
- `PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME=multi-ai-sidepanel`
- `PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE=browser`
- `PROMPT_SWITCHBOARD_LIVE=1 npm run test:live:open-browser`

If you must override the runtime profile source, keep it on the repo-owned
persistent browser root and use `PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY`
explicitly. The default Chrome root is bootstrap-source only, not the canonical
live runtime root.

If you want the login window and the automation window to be the exact same
browser instance, use the attach helper instead of reopening a new persistent
context:

```bash
PROMPT_SWITCHBOARD_LIVE=1 npm run test:live:open-browser
```

That helper launches or reuses one repo-owned real Google Chrome browser lane
with:

- the repo's unpacked extension side-loaded
- `~/.cache/multi-ai-sidepanel/browser/chrome-user-data`
- the resolved `multi-ai-sidepanel` / `Profile 1` profile
- a fixed CDP listener on `http://127.0.0.1:9336`
- a generated local identity tab under
  `.runtime-cache/browser-identity/index.html` that shows the repo label, CDP
  port, profile, and browser root for this lane

After you finish any manual login in that exact window, run:

```bash
PROMPT_SWITCHBOARD_LIVE=1 npm run test:live
```

Use this attach path when you need to prove a real logged-in browser session
without guessing whether the manual login landed in the same instance that
Playwright later drives. Treat the attach lane as the canonical manual seeding
and page-truth path for the current live proof. Treat the persistent+clone
ladder above as a non-canonical maintainer troubleshooting path for probe,
diagnose, support-bundle, and live runs when you explicitly need a side-loaded
Chromium clone instead of the repo-owned persistent Chrome attach lane.

Treat the generated identity tab as the human-facing anchor for this repo's
browser lane:

- keep it open as the left-most tab when possible
- pin it manually once if you want a stable visual marker in the tab strip
- use `PROMPT_SWITCHBOARD_BROWSER_IDENTITY_LABEL` to override the displayed repo
  label
- use `PROMPT_SWITCHBOARD_BROWSER_IDENTITY_ACCENT` with a hex color such as
  `#2563eb` if you want a repo-specific accent

Do not script Chrome's private avatar/theme internals as part of the normal
repo bootstrap. Manual one-time profile color/avatar customization is fine, but
the repo-owned automation should stay on the stable side of Chrome's public
surface.

Treat `npm run test:mcp:smoke` as the minimal MCP proof path. It validates that
the sidecar starts, exposes the expected tools/resources, and completes a real
stdio client handshake against the local loopback bridge contract.

`npm run test:coverage` enforces the current repo baseline:

- lines: `80%`
- statements: `80%`
- functions: `80%`
- branches: `70%`

The default coverage threshold currently applies to the product TypeScript
surface under `src/`.

Repo-owned non-`src` TypeScript is still guarded, but through dedicated packs
instead of the global coverage threshold:

- `npm run test:mcp:unit`
- `npm run test:mcp:smoke`
- `npm run check:verify-scripts`

## Language Boundary

Keep contributor-facing governance, docs, scripts, CI logs, and review comments
in English.

Allowed non-English exceptions are intentionally narrow:

- user-facing product localization files such as `src/i18n/locales/zh.json`
- third-party DOM compatibility strings required to automate supported sites
- tests that must match those localized UI strings or third-party DOM labels

## Change Rules

- Keep changes focused.
- Avoid unrelated refactors.
- Update tests when behavior changes.
- Update public docs when commands, runtime boundaries, or support paths change.
- Do not commit secrets, tokens, private keys, personal data, logs, caches, or
  runtime artifacts.

## Pull Requests

Every pull request should explain:

- what changed
- why it changed
- how it was verified
- whether supported site behavior changed
- whether permissions or public support/security wording changed

`CODEOWNERS` is the review routing baseline for this repository.
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) defines the expected behavior for
project interaction.
Use the PR template checklist to confirm public-surface wording, changelog
alignment, and release narrative drift before merging release-facing changes.

## Bug Reports

Please include:

- expected behavior
- actual behavior
- reproduction steps
- browser and platform details
- whether the issue depends on a specific supported site DOM

For security-sensitive reports, follow [`SECURITY.md`](./SECURITY.md) instead
of opening a detailed public issue.

## Release Notes

Before a public release or store submission:

- confirm the product name is `Prompt Switchboard`
- confirm the short tagline remains `One prompt, many AI chats, one side panel.`
- confirm the manifest description remains `Local-first AI compare workspace for ChatGPT, Gemini, Perplexity, Qwen, and Grok in one browser side panel.`
- confirm the extension icon assets are:
  - `public/prompt-switchboard-icon-16.png`
  - `public/prompt-switchboard-icon-48.png`
  - `public/prompt-switchboard-icon-128.png`
- keep `public/prompt-switchboard-icon.svg` for repo/web surfaces only; Chrome extension manifest icons must stay on PNG assets
- keep `npm run test:pre-push` and `npm run test:nightly` green
- run `npm run verify:release-baseline`
- run `npm run verify:store-readiness`
- publish the GitHub release before treating release-proof as closed
- run `npm run verify:release-closure` after the release is published
- keep `npm run verify:host:pack` green so repository-level Actions policy, security reporting, homepage/discussions/topics/pages, and the front-door social preview contract do not drift
- manually confirm the current social preview image is still the intended latest visual when front-door assets change
- keep `npm run verify:host-release-proof` green so the latest public release still exposes zip, checksum, and SPDX SBOM assets
- keep `npm run verify:store-readiness` green so the repo-side install copy, policy docs, screenshots, icon wiring, and release workflow markers stay ready for browser-store submission work
- confirm the release workflow still publishes a zip, checksum, SPDX SBOM, and GitHub artifact attestations
- keep third-party GitHub Actions pinned to full commit SHAs in the release path
- refresh `npm run marketing:assets` when README or landing-page visuals change
- generate `npm run release:bundle` before tagging a release so the publishable extension zip is ready
- generate `npm run release:sbom` before tagging a release so the release proof set includes the bundled SPDX SBOM
- treat [`CHANGELOG.md`](./CHANGELOG.md) as the canonical tracked release history and keep the GitHub release body aligned with it
- manually review the latest GitHub release page for narrative drift, attached assets, and the `latest` marker before tagging the next release
- keep [`PRIVACY.md`](./PRIVACY.md), [`SECURITY.md`](./SECURITY.md), and [`CHANGELOG.md`](./CHANGELOG.md) aligned with the live repository
