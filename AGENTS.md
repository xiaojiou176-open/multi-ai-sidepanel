# AGENTS

This repository carries the public-facing application surface for the Prompt
Switchboard browser extension, even when the live GitHub repository remains
private during closeout or host-surface remediation.

## Public Surface Rules

- Keep tracked Markdown in English.
- Keep governance, maintenance, and tooling files in English.
- Non-English content is only allowed for product localization resources and
  third-party DOM compatibility selectors.
- Keep the public doc surface thin.
- Do not add archive, audit, rehearsal, or governance-log documents to the
  tracked repository surface.
- Do not track runtime artifacts, caches, logs, or agent working directories.

## Current Visibility Truth

- Keep the tracked docs ready for the intended public product surface, but do
  not assume the current GitHub repository visibility already matches that
  intent.
- Treat repo-side truth, host-side GitHub truth, and anonymous public-surface
  truth as separate ledgers during closeout.
- Do not flip the repository public, enable a public Pages frontdoor, or claim
  anonymous release/frontdoor availability until:
  - repo-side verification is green
  - host-side verification is green
  - current and historical sensitive-surface checks are green or explicitly
    classified as immutable platform residue

## Protected Paths

The following paths must stay out of the tracked repository surface:

- `.agents/`
- `.agent/`
- `.codex/`
- `.claude/`
- `.serena/`
- `.runtime-cache/`
- `logs/`
- `log/`
- `*.log`

Root `AGENTS.md` and `CLAUDE.md` are intentionally tracked.

## No-Code-Loss And Destructive Action Discipline

- Treat every dirty worktree as meaningful until proven otherwise.
- Preserve repo-owned changes before branch cleanup, history rewrite, or other
  destructive Git operations.
- Do not use `git reset --hard`, force-push history rewrites, or delete
  branches/worktrees as a shortcut for closeout.
- Prefer a dedicated closeout branch, logical commits, and pushed review
  artifacts over local-only cleanup.

## Verification Baseline

Use these repo-side commands before release-sensitive changes:

```bash
npm run verify:host-safety
npm run verify:sensitive-surface
npm run secrets:scan:history
npm run test:ci
npm run clean:runtime && npm run test:e2e:shell
```

Official CI for this repository stays on GitHub Hosted runners (`ubuntu-latest`).
Local `npm run test:ci` is a developer-side reproduction command, not a
self-hosted runner contract.

Treat host-side checks as a separate verification class for the live GitHub
repository surface:

```bash
npm run verify:host-actions-policy
npm run verify:host-security
npm run verify:host-sensitive-surface
npm run verify:host-frontdoor
npm run verify:host-release-proof
```

Use `npm run clean:runtime` if local verification leaves transient files behind.

## Host Safety Contract

- `worker-safe` is the default mode for this repository.
- Keep raw host-control primitives out of this repository.
  - Do not add `killall`, `pkill`, `killpg(...)`, broad `kill -9`, raw
    `process.kill(...)` / `os.kill(...)` with `pid <= 0`, `osascript`,
    `System Events`, `loginwindow`, `showForceQuitPanel`, or similar
    desktop/process-wide control paths.
- Prompt Switchboard live helpers must fail closed instead of trying host-wide
  recovery.
  - Prefer repo-owned browser identity, explicit profile resolution, and CDP
    attach checks over host cleanup or desktop scripting.
- Cleanup must stay exact-scope: recorded positive repo-owned PIDs, repo-owned
  browser roots, repo-owned profiles, and directly held child handles only.
- Detached browser launch is review-required only and must stay inside a
  repo-owned browser root; worker/test/live paths must not depend on
  `detached: true` + `.unref()` as the default recovery path.
- Enforce this contract with:
  - `npm run verify:host-safety`
- If a future experiment appears to need one of those primitives, stop and
  redesign the flow around browser-owned/CDP-owned proof or an explicit
  human-run operator packet instead of landing the primitive here.

## Browser And Resource Discipline

- Treat confirmed missing login state as a blocker quickly.
  - If one or two focused checks against the real Prompt Switchboard
    browser/profile already show the required site is logged out or otherwise
    unavailable, record that state as a blocker instead of escalating into
    repeated browser relaunches.
- Respect the machine ceiling before launching anything browser-like.
  - Before launching a new browser or Playwright-backed browser instance for
    this repo, inspect the current machine state.
  - If more than six browser / Chromium / Chrome / Playwright browser
    instances are already active, do not launch another one until the load is
    reclaimed.
- Every browser lane must be repo-owned and traceable.
  - Before attaching to any browser or CDP target, be able to answer who
    launched it, which repo owns it, which profile and port it uses, and how it
    will be cleaned up.
- Do not borrow another repo's live lane.
  - Do not attach to or reuse a browser, profile, tab set, or CDP endpoint that
    belongs to another active repo unless the current task board explicitly
    marks that lane as shared and safe to reuse.
- Prefer the lightest truthful path.
  - Reuse an existing canonical attach lane when possible.
  - Prefer low-focus inspection and diagnosis paths over opening a fresh browser
    window.
- Login-state-sensitive live flows must resolve the dedicated real Google
  Chrome profile lane through:
  - `PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR`
  - `PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME`
  - `PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY`
  - The canonical root is `~/.cache/multi-ai-sidepanel/browser/chrome-user-data`
    with a single repo-owned `multi-ai-sidepanel` profile.
  - Default Chrome user data under `~/Library/Application Support/Google/Chrome`
    is migration-source only, not the canonical runtime root.
  - Fail closed when that profile resolution is missing or ambiguous; do not
    fall back to a shared Chromium `Default` profile.
- Keep browser tabs minimal.
  - Open only the canonical tabs needed for the current proof path.
  - Clean up repo-opened tabs after the evidence is collected.

## Temp Clone, Cache, Disk, And Docker Hygiene

- Keep repo-owned runtime scratch inside `.runtime-cache/`.
- Keep repo-owned external cache under `~/.cache/multi-ai-sidepanel/` unless an
  explicit repo-owned override is set for the current run.
- Treat `~/.cache/multi-ai-sidepanel/browser/chrome-user-data/` as persistent
  browser state.
  - Exclude it from TTL / cap pruning.
  - Exclude it from `npm run clean:runtime`.
- External repo-owned cache must stay bounded.
  - Default TTL: `72h`
  - Default cap: `2 GB`
  - Apply pruning only to disposable repo-owned external cache paths such as
    `live-profile-clones/` and similar scratch roots.
  - Prune on entry to cache-producing live/browser flows and during
    `npm run clean:runtime`.
- Live temp clones must use a repo-owned exact prefix and must be cleaned up by
  default.
- Retained live evidence, release evidence, and preview bundles must stay on
  explicit retention rules instead of accumulating silently.
- Shared tooling caches such as `~/Library/Caches/ms-playwright/` are
  detection-only from this repo.
  - Report them during disk audits.
  - Never auto-clean them from Prompt Switchboard commands.
- Do not leave root-level noise such as `.DS_Store`, stray `test-results`, or
  other repo-owned runtime artifacts behind after verification.
- Perform repo-scoped cleanup only.
  - Do not run broad machine-wide cleanup that could damage other repos.
- Treat Docker hygiene as part of closeout.
  - Inventory repo-owned containers / images / volumes before cleanup.
  - Never run broad global prune commands as a shortcut.
- The repo-local operating manual for these rules lives under:
  - `.agents/skills/prompt-switchboard-resource-hygiene/`

## Cross-Repo Isolation

- Do not mix Prompt Switchboard live tabs or profiles with other repos' live
  lanes.
- Do not assume the user's everyday browser window is available as a disposable
  default test surface.
- If global browser/process inventory suggests another repo already owns the
  active lane, stop and wait for resource reclamation instead of competing for
  the same machine resources.

## External Account Write Boundary

- Do not perform write operations against external accounts, dashboards,
  domains, registrars, browser stores, or login providers unless the user
  explicitly authorizes that exact external control plane in the current
  thread.
- It is allowed to read, diagnose, and prepare exact human action packets for
  those surfaces.

## Git And GitHub Closeout

- This repository currently has git and GitHub write authorization for
  repo-owned closeout work when the current task explicitly calls for final
  convergence and closeout.
- Keep repo-side completion, worktree completion, remote/main completion, and
  external/manual-only completion separate in all closeout reports.
- Use `xiaojiou176` as the primary GitHub operator in this repo.
- If an independent reviewer or approver is required, use
  `leilei999lei-lab`.
- Do not use `terryyifeng` for GitHub operations in this repository.
- Final convergence should leave:
  - mission-related changes landed on `main`
  - repo-owned stale branches / worktrees / PRs explicitly closed, merged,
    deleted, or classified
  - only true external-only or human-only blockers outside the repo
- Keep this tracked contract principle-level and store the execution checklist
  in:
  - `.agents/skills/prompt-switchboard-resource-hygiene/SKILL.md`
  - `.agents/skills/prompt-switchboard-consumer-host-kits/SKILL.md`
