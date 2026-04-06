# Changelog

All notable changes to this project will be documented in this file.

This tracked changelog is the canonical release narrative for the repository.
GitHub release bodies should mirror the matching entry here instead of telling a
different version story.

## [Unreleased]

## [0.2.2] - 2026-04-05

### Added

- Added model readiness surfacing before compare runs, including per-model status
  pills and selector-drift-aware diagnostics.
- Added targeted compare recovery so failed models can be retried without
  replaying the entire turn.
- Added a transient background replay buffer so in-flight response updates can
  be restored when the side panel reconnects.
- Added compare insight badges, judge-prompt generation, and response
  continuation shortcuts inside the compare board.
- Added local prompt recipes and pinned sessions to deepen the compare-workbench
  workflow without introducing a hosted relay.
- Added a first-run compare checklist inside the empty-state workspace so new
  users can open tabs, re-check readiness, and seed a useful first prompt
  without leaving the extension.
- Added per-model run timelines and expanded follow-up-round actions inside the
  compare board so users can see where a compare run stalled and move cleanly
  into the next round.
- Added readiness repair cards that turn blocking model states into explicit
  recovery actions instead of static status pills.
- Added readable compare exports so a completed turn can be copied or exported
  as a local summary or Markdown artifact instead of only a backup JSON dump.
- Added built-in prompt packs for writing, research, coding explanations, and
  rewriting so new compare runs can start from a reusable scenario instead of a
  blank prompt.
- Added public use-case pages and a prompt-packs page so the front door can
  answer scenario-level search intent without pretending to be a generic AI
  assistant.
- Added a live-smoke doctor command so maintainers can see the exact missing
  browser-profile prerequisites before trying the real Tier C live proof path.
- Added a Native Messaging scaffold pack with a host-manifest template,
  user-level manifest helper, and explicit docs that keep this release honest
  about the active loopback transport.
- Added an honest analyst recommendation step so AI Compare Analyst can point to
  the best-fit answer to continue from, while still allowing “no reliable
  recommendation yet” instead of forcing a fake winner.
- Added a repo-side store-readiness verifier so browser-store submission
  materials are checked by script instead of only being described in prose.

### Changed

- Added explicit host-side verification for repository-level GitHub Actions
  policy hardening and latest public release proof assets.
- Clarified the maintainer language boundary so governance and collaboration
  files stay English while product localization and third-party DOM compatibility
  remain valid exceptions.
- Tightened the release-preparation checklist around public proof assets and
  repository-level Actions policy.
- Tightened readiness gating so missing submit controls are treated as selector
  drift before compare runs instead of surfacing only during prompt execution.
- Hardened the shell E2E runtime lane so stale Playwright scratch profiles are
  cleared before the next default verification pass.
- Added a readiness repair center so blocked models point to the next recovery
  action instead of only showing a status pill.
- Added a per-model compare run timeline so users can tell whether a turn is
  blocked during readiness, prompt delivery, or answer streaming.
- Productized the follow-up round surface so completed compare turns can seed
  the next prompt without rebuilding context by hand.
- Added a first-run checklist inside the empty compare state to shorten the
  path from install to the first successful compare run.
- Strengthened the front-door copy and metadata around the product category:
  local-first AI compare workspace, browser side panel, and no hosted relay.
- Added repo-side alias readiness metadata so future `.ai` or campaign domains
  can redirect into the canonical Prompt Switchboard homepage without forcing a
  primary brand rename inside the repository.
- Upgraded the MCP doctor output from a static note to a real bridge-health
  report that distinguishes \"bridge not running\" from \"bridge running but
  extension not bootstrapped yet\".
- Tightened public wording so the release no longer implies an automatic
  winner engine; the shipped surface now consistently describes best-fit answer
  selection, follow-up rounds, and analyst assistance.
- Replaced the brittle split-coverage runner with the supported single-pass
  Vitest coverage path and aligned the enforced repo baseline to the current
  documented thresholds: lines 80, statements 80, functions 80, branches 70.
- Added the store-readiness verifier to the release baseline so install-surface
  wording, policy docs, screenshots, brand icon wiring, and release workflow
  markers stay aligned before release or store submission work.
- Clarified the install and supported-sites docs so they name OpenAI Codex and
  Claude Code as MCP-capable local coding agents that can use the Prompt
  Switchboard sidecar without implying generic browser automation.

### Notes

- The latest public `v0.2.1` release has been backfilled so the public asset
  set now exposes the packaged zip, checksum, and SPDX SBOM.
- The GitHub custom social preview setting is still a live host-side gap until
  `verify:host-frontdoor` passes again.
- The active MCP transport in this release remains the local stdio sidecar plus
  the localhost bridge. Chrome Native Messaging is prepared as scaffold only,
  not advertised as a shipped runtime path.

## [0.2.1] - 2026-03-26

### Changed

- Tightened the release workflow to repo-side checks only after the `v0.2.0`
  workflow-action fix.
- Re-ran the release proof path so the packaged bundle and verification trail
  stay aligned with the current repository state.
- Refreshed the repo baseline, host-security, and host front-door governance
  checks without changing user-facing extension behavior.

### Notes

- This patch release is a release-process follow-up. It does not introduce new
  product features.
- The latest GitHub release page should be manually checked before the next tag
  so its body, assets, and `latest` marker still match this changelog entry.

## [0.2.0] - 2026-03-25

### Added

- Versioned release-bundle script and release workflow for packaged extension
  downloads.
- Before-and-after proof asset that shows the tab-juggling reduction in one
  frame.
- Pages landing page, social preview asset pack, and tracked marketing
  screenshots and GIF.
- GitHub Pages deployment workflow and release-drafter automation.
- Feature request issue template for product-facing feedback.
- Front-door contract test for README, docs, SEO metadata, and visual assets.
- Host-side front-door verification for homepage, discussions, Pages, topics,
  and release labels.
- PR template and CI push flow now explicitly guard front-door wording, assets,
  and host-side public surface drift.
- Open-source health files: `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md`.
- Privacy policy reference for extension users and reviewers.
- Third-party and redistribution note for release review and public consumers.
- Release-preparation checklist and store listing guidance.
- Host-side verification script and fixed release-baseline command.
- Prompt Switchboard brand icon asset for manifest and HTML entrypoints.
- Compare-first sidepanel view with per-model status cards.
- Turn-aware message metadata for compare grouping and delivery state tracking.
- Brand guard, selector drift contract tests, and opt-in live smoke
  scaffolding.
- Versioned `pre-commit`, `gitleaks`, and `git-secrets` secret-guard wiring for
  local and CI verification.
- Dependabot version-update configuration for npm and GitHub Actions.
- Root `AGENTS.md` and `CLAUDE.md` navigation files for AI maintainers.
- `CODEOWNERS`, issue templates, and a PR template for the public collaboration
  surface.

### Changed

- README and landing page now lead with a real install path, a release-bundle
  route, and harder proof of workflow payoff.
- README was rewritten as a product-style front door with hero visuals, FAQ,
  roadmap, and stronger Star-conversion copy.
- Public GitHub metadata now points to a Pages homepage and
  discussions-enabled front surface.
- Release baseline now cleans transient runtime artifacts before and after
  verification and E2E execution.
- Public-facing product name aligned to `Prompt Switchboard`.
- Package name aligned to `multi-ai-sidepanel`.
- Placeholder Vite icon references replaced with Prompt Switchboard branding
  assets.
- Extension and package version target advanced to `0.2.0`.
- Contributor-facing build output, documentation, and gate surfaces now treat
  `dist/` as the single supported build output path.
- Husky now delegates directly to the versioned `pre-commit` contract and CI
  runs the same repo-side secret guard ladder.
- GitHub host protections were verified on March 24, 2026, including private
  vulnerability reporting, `main` branch protection, Dependabot security
  updates, and default code scanning.
- The public documentation surface was reduced to the smallest core set needed
  for repository use and release review.
- Public docs and templates were reduced again to an ultra-thin English-only
  surface with embedded support and security wording.

### Removed

- Historical DOM capture fixtures that were not suitable for public
  distribution.
- `SUPPORT.md` and `THIRD_PARTY.md` were removed and their essential guidance
  was folded back into core documents.

### Security Notes

- Git history was rewritten on March 24, 2026 to remove historical DOM capture
  commits; older off-repo clones or cached archives created before that rewrite
  still require manual disposal outside this repository.
