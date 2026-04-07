# Prompt Switchboard

One prompt, many AI chats, one side panel.

Prompt Switchboard is a **compare-first, local-first, browser-native AI compare workspace** and **browser-side control tower** for multi-model compare runs. It lets you send one prompt to ChatGPT, Gemini, Perplexity, Qwen, and Grok, then compare the replies in one browser side panel instead of bouncing between tabs.

It also ships a governed local MCP sidecar for **Codex and Claude Code browser workflows** while OpenCode and OpenClaw stay on public starter-bundle lanes until stronger host proof exists.

> **Trust boundary**
>
> Prompt Switchboard stays inside your browser, uses your existing sessions on supported sites, and does **not** add a hosted relay or account layer.
> The supported repo build also does **not** rely on OS-level desktop
> automation, Force Quit helpers, or host-wide process cleanup.

[Install the latest build](https://github.com/xiaojiou176-open/multi-ai-sidepanel/releases/latest) • [Landing page](./docs/index.html) • [Install guide](./docs/install.html) • [First compare guide](./docs/first-compare-guide.html) • [Supported sites](./docs/supported-sites.html) • [Trust boundary](./docs/trust-boundary.html) • [FAQ guide](./docs/faq.html) • [Prompt packs](./docs/prompt-packs.html) • [Releases](https://github.com/xiaojiou176-open/multi-ai-sidepanel/releases) • [Discussions](https://github.com/xiaojiou176-open/multi-ai-sidepanel/discussions) • [Privacy](./PRIVACY.md) • [Security](./SECURITY.md) • [Building locally](./CONTRIBUTING.md)

![Prompt Switchboard hero showing one prompt and multiple AI answers side by side.](./docs/assets/prompt-switchboard-hero.png)

The shortest way to evaluate Prompt Switchboard is simple: install the latest packaged build, keep the AI tabs you already use open, then ask once from the side panel and compare the answers in one place.

The supported install path today is the packaged GitHub Release zip. Browser-store submission materials are being kept ready, but GitHub Releases remains the supported install surface today.

Before the first compare run, make sure the supported AI tabs you want to use
are already open and signed in inside the same browser profile.
The side panel now includes a first-run checklist and readiness repair actions,
so the shortest path to success lives inside the product instead of only in the docs.

## Default Path

If you only remember one route through this repo, remember this one:

1. **Install the latest build** from GitHub Releases.
2. **Run one real compare** from the side panel with the tabs you already trust.
3. **Stay in the same turn** to retry failures only or export a readable compare artifact.

Use these pages in that exact order:

- [Install guide](./docs/install.html)
- [First compare guide](./docs/first-compare-guide.html)
- [Prompt packs](./docs/prompt-packs.html)

## Why It Feels Worth Saving

- **Compare responses side by side**: keep the same prompt aligned across multiple model cards instead of bouncing between tabs.
- **Check readiness before you send**: see which selected model tabs are ready, still loading, missing, or likely affected by selector drift.
- **Repair blocked models without guesswork**: readiness now points you to the next action when a tab is missing, loading, mismatched, or not exposing the send controls.
- **Recover only the failures you care about**: retry the models that failed instead of replaying the whole compare run.
- **Turn disagreement into the next move**: seed the next compare round, keep seed-only actions honest, and run the next compare only when you choose to.
- **Carry useful results outside the side panel**: copy a compare summary, export Markdown, or keep a readable local artifact instead of only a backup dump.
- **Add optional AI analysis without replacing the core compare lane**: the AI Compare Analyst can summarize consensus, explain disagreement, recommend the best-fit answer to continue from, and draft the next question by reusing one browser tab you already trust, while the main compare flow stays local-first.
- **Expose product actions through a local MCP sidecar**: Prompt Switchboard can expose readiness, compare, retry, export, session, analyst, and next-step workflow actions to local agents without becoming generic browser automation.
- **Keep everything local in your browser**: no hosted relay sits between your prompt and the supported AI sites.
- **Reuse the AI tabs you already use**: Prompt Switchboard works with the browser sessions you already keep open.
- **Start from reusable prompt packs**: launch writing, research, coding, and rewriting compare runs without starting from a blank prompt every time.
- **Export, restore, and reuse compare runs**: carry compare runs between machines through local import/export and save repeatable prompt recipes.

## Try It Now

Before you start:

- a Chromium-compatible browser with Developer Mode available
- at least one supported AI chat tab already open and signed in

1. Open the [latest Releases page](https://github.com/xiaojiou176-open/multi-ai-sidepanel/releases/latest).
2. Download the packaged extension zip, unzip it locally, open `chrome://extensions`, enable **Developer Mode**, and use **Load unpacked** on the extracted folder.
3. If the Prompt Switchboard icon is hidden, open the browser Extensions menu, pin Prompt Switchboard, then click the toolbar icon to open the side panel.
4. Open the supported AI tabs you want to compare, then ask once from the side panel.

Today the public install path is the packaged GitHub Release zip. A lower-friction store distribution path is being prepared, but it is not live yet.

If you are validating the real Chrome proof lane, keep one extra rule in mind: official Google Chrome branded builds 137+ / 139+ no longer reliably auto-load unpacked extensions from command-line flags. Automated runtime proof should use Chromium or Chrome for Testing. Real Chrome proof keeps the same signed-in profile, then uses `chrome://extensions` -> **Developer Mode** -> **Load unpacked** manually.

Need the local build path, release workflow, or front-door maintenance steps? Read [`CONTRIBUTING.md`](./CONTRIBUTING.md).

Maintainer-only cleanup and runtime hygiene commands live in
[`CONTRIBUTING.md`](./CONTRIBUTING.md) so this README can stay focused on the
public product surface.

### Good First Compare Prompts

If you want to see the value quickly, try one of these on three or more supported sites:

- `Summarize the launch plan for a local-first browser extension in three bullets.`
- `Compare the trade-offs between React and Vue for a browser extension UI.`
- `Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.`

### Explore By Use Case

- [Compare ChatGPT vs Gemini vs Perplexity](./docs/compare-chatgpt-vs-gemini-vs-perplexity.html)
- [Best AI for rewriting text](./docs/best-ai-for-rewriting-text.html)
- [Best AI for coding explanations](./docs/best-ai-for-coding-explanations.html)
- [Why local-first AI comparison matters](./docs/local-first-ai-comparison.html)
- [Prompt packs](./docs/prompt-packs.html)

### After The First Compare Works

- Retry only the failed cards from the same compare turn.
- Export a readable compare summary or Markdown artifact.
- Reuse [Prompt packs](./docs/prompt-packs.html) when you want a faster second run.

### Optional Builder Lane

If you already use MCP-capable coding agents, come here **after** the first compare works:

- [Prompt Switchboard for Codex, Claude Code, and MCP agents](./docs/mcp-coding-agents.html)
- [Prompt Switchboard MCP starter kits](./docs/mcp-starter-kits.html)
- [Prompt Switchboard host packets](./docs/mcp-host-packets.html)
- [Prompt Switchboard public distribution matrix](./docs/public-distribution-matrix.html)

## Why It Beats Tab Juggling

![Prompt Switchboard before-and-after comparison showing manual multi-tab comparison versus one local side panel workspace.](./docs/assets/prompt-switchboard-before-after.svg)

The strongest product claim here is not abstract AI productivity. It is much simpler: Prompt Switchboard removes the messy part of side-by-side comparison.

| Manual multi-tab compare                        | Prompt Switchboard                                           |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Paste the same prompt into every site           | Ask once from the side panel                                 |
| Wait in separate tabs and windows               | Watch status chips update in one board                       |
| Reconstruct which answer belongs to which model | Keep aligned model cards in one compare view                 |
| Copy results back into your own notes by hand   | Copy the best-fit answer or reopen the original tab directly |
| Lose the comparison context after the session   | Keep the run saved locally for export and restore            |

## How It Works

1. **Open the sites you already use**: keep ChatGPT, Gemini, Perplexity, Qwen, or Grok signed in inside normal browser tabs.
2. **Ask once from the side panel**: Prompt Switchboard fans the same prompt out from one local workspace.
3. **Compare clearly**: review the answers side by side, inspect the per-model run timeline, copy the best response, or jump back into the original model tab.
4. **Recover, export, and continue**: retry only the failed models, use the repair center when readiness blocks a run, export a readable compare artifact, or seed the next compare round from the completed answers.

## Builder Lane (After The First Compare)

Prompt Switchboard also includes a local MCP sidecar for product-level agent integrations.
That builder lane is real, but it is **not** the default first-stop story of the repo.
The default story is still: install, run one compare, then export or retry from the same turn.

- The sidecar speaks MCP over `stdio`.
- The extension bridge stays local on `127.0.0.1`.
- The exposed surface is intentionally narrow: readiness, model tabs, compare, retry, export, session reads, the existing browser-session analyst lane, and the built-in linear workflow tools.
- The sidecar also exposes a bridge-health check so local agents can tell the difference between "the MCP server is up" and "the extension is actually attached."
- The MCP surface does **not** expose arbitrary DOM selectors or generic website automation.

OpenAI Codex and Claude Code are the strongest repo-specific host flows in this
release. This repo now also ships generic MCP starter assets for OpenCode and
OpenClaw, but those paths still remain secondary compatibility lanes instead of
the main front-door story.

Use the repo-local operator helper for the main maintainer path:

```bash
npm run mcp:operator -- doctor
npm run mcp:operator -- server
npm run mcp:operator -- smoke
npm run mcp:operator -- live-probe
npm run mcp:operator -- live-diagnose
npm run mcp:operator -- live-support-bundle
```

For the fuller repo-local operator surface, including `bridge-status`, cached
`readiness`, `workflow-list`, and `workflow-get`, use the
[`MCP agents guide`](./docs/mcp-coding-agents.html).

The current bridge model is a localhost loopback bridge between the sidecar and the extension runtime. It is the repo-runnable MVP, not a hosted relay and not a generic browser bot.

Switchyard runtime-backed analysis is now a **maintainer-local / partial lane** when a local Switchyard service is reachable on `127.0.0.1:4317`. It stays optional, it only powers the analyst lane, and it does **not** replace the browser-tab compare cockpit.

Today the MCP sidecar is the builder-facing integration surface.
Prompt Switchboard does **not** ship a public HTTP API or a general-purpose SDK in this release.
If you want the concrete contract, start from [`mcp/server.ts`](./mcp/server.ts) and
[`src/bridge/protocol.ts`](./src/bridge/protocol.ts).

Current builder support matrix:

- **Supported now**: the local MCP sidecar, Prompt Switchboard product actions, and the repo-specific Codex / Claude Code browser workflow lane
- **Maintainer-only / partial**: the repo-local operator helper, maintainer-local live proof, session-scoped workflow snapshots, and the optional local Switchyard runtime-backed analyst lane
- **Starter-kit only / unverified host lane**: OpenCode project-root MCP config and OpenClaw MCP registry snippets are now shipped under `mcp/integration-kits/`, but this repo still does not claim a verified host lane for them
- **Planned only**: public CLI/API/SDK surfaces and plugin-style consumer ecosystem packages

Current public distribution truth:

- **Supported public install surface today**: Prompt Switchboard itself installs from the packaged GitHub Release zip
- **Public bundle surface now**: Codex, Claude Code, OpenCode, and OpenClaw each have a repo-owned public bundle with starter assets, placement hints, smoke flow, and synced docs
- **Release-ready packet command**: run `npm run release:host-kits` to pack the current host packets into local artifacts under `dist/public-bundles`
- **Official listing truth**: use the [public distribution matrix](./docs/public-distribution-matrix.html) before claiming any marketplace, registry, or plugin listing
- **Machine-readable distribution truth**: use `prompt-switchboard://builder/public-distribution` for the MCP resource view of the same bundle-versus-listing split

For repo-specific host setup, keep the official client-side configuration flows separate:

- **Codex**: use the official `config.toml` / `codex mcp add` flow.
- **Claude Code**: use the official `.mcp.json` / `claude mcp add` flow.
- **OpenCode**: use the official project-root `opencode.json` / `opencode.jsonc` MCP config flow. This repo now ships a starter at [`mcp/integration-kits/opencode.jsonc.example`](./mcp/integration-kits/opencode.jsonc.example).
- **OpenClaw**: use the official `openclaw mcp set <name> <json>` registry flow. This repo now ships a starter JSON object plus a shell example at [`mcp/integration-kits/openclaw.prompt-switchboard.json.example`](./mcp/integration-kits/openclaw.prompt-switchboard.json.example) and [`mcp/integration-kits/openclaw.mcp.set.example.sh`](./mcp/integration-kits/openclaw.mcp.set.example.sh).
- Prompt Switchboard stays the local MCP server and browser-side product surface; it does not become a Codex wrapper, a Claude shell, or a public API.
- Repo-shipped starter kits now live under [`mcp/integration-kits/`](./mcp/integration-kits/README.md) for the strongest current host bindings.
- That same folder now also carries OpenCode / OpenClaw starter skill templates so users can reuse the preferred Prompt Switchboard tool flow instead of inventing it from scratch.
- The same truth is now available as a machine-readable artifact at [`mcp/integration-kits/support-matrix.json`](./mcp/integration-kits/support-matrix.json) and as the MCP resource `prompt-switchboard://builder/support-matrix`, including the first-call sequence and the workflow follow-through calls that come after `run_workflow`.
- That same builder packet now also includes per-host `placement_hint` values, so developers do not have to infer the last configuration step from prose alone.
- When host wiring looks correct but site behavior still feels brittle, read `prompt-switchboard://sites/capabilities` next. That resource is the current per-site DOM/readiness/private-API boundary map for the compare-first product surface.
- For OpenCode and OpenClaw specifically, keep the claim honest: the repo now ships generic MCP starter assets, but those paths are still **starter-kit only**, not a fully verified Prompt Switchboard host lane.

Quick placement map:

| Host        | Starter asset                                                                     | Where it goes                                                                 |
| ----------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Codex       | `codex.config.toml.example`                                                       | copy the MCP block into your Codex `config.toml`                              |
| Claude Code | `claude.mcp.json.example`                                                         | copy the MCP block into your Claude Code config such as `.mcp.json`           |
| OpenCode    | `opencode.jsonc.example`                                                          | save it as project-root `opencode.jsonc` inside your Prompt Switchboard clone |
| OpenClaw    | `openclaw.prompt-switchboard.json.example` or `openclaw.mcp.servers.json.example` | register it with `openclaw mcp set` or place it under `mcp.servers`           |

Use the [public distribution matrix](./docs/public-distribution-matrix.html) when you need the public truth split between:

- repo-owned starter bundle available now
- official marketplace or registry surface exists
- Prompt Switchboard is actually published there already

Use the [host packets page](./docs/mcp-host-packets.html) when you want the exact packet for Codex, Claude Code, OpenCode, or OpenClaw without scanning the rest of the builder docs first.

A practical local-agent sequence looks like this:

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`
4. `prompt_switchboard.analyze_compare`
5. `prompt_switchboard.run_workflow` with `workflowId: "compare-analyze-follow-up"`
6. `prompt_switchboard.get_workflow_run` to read the latest session-scoped workflow snapshot
7. `prompt_switchboard.list_workflow_runs` when you need the recent workflow snapshot list
8. `prompt_switchboard.resume_workflow` after you have the external step result the workflow was waiting for
9. `prompt_switchboard.retry_failed` or `prompt_switchboard.export_compare` when the compare lane still needs recovery or export

If you want the **smallest useful first proof** instead of the full follow-through path, stop after:

1. `prompt_switchboard.bridge_status`
2. `prompt_switchboard.check_readiness`
3. `prompt_switchboard.compare`

Workflow snapshots are intentionally **session-scoped runtime cache**, not durable cold-start ledger entries. `run_workflow` can emit the current external action, `get_workflow_run` and `list_workflow_runs` can inspect that session-scoped state, and `resume_workflow` can continue the built-in lane once you provide the external step result. If a workflow snapshot is gone after the browser session ends, stage the next step again from the compare turn instead of assuming long-term resumability.

The repo-local operator helper now mirrors that same story more honestly: `workflow-list`, `workflow-get`, and `workflow-resume` return normalized workflow interpretations alongside the raw MCP payload instead of leaving the builder to decode every workflow shape by hand.

Native Messaging is **not** the shipped transport in this release.
If you want to explore that direction later, start from the scaffold notes in
[`mcp/native-messaging/README.md`](./mcp/native-messaging/README.md) instead of treating it as an already-wired runtime path.

Today the safest startup order is:

1. start `npm run mcp:operator -- server`
2. confirm the unpacked extension is loaded in the same browser profile
3. reopen the side panel or an extension page if the browser was already running before the sidecar started

![Animated Prompt Switchboard demo showing the compare-first flow from empty state to completed multi-model answers.](./docs/assets/prompt-switchboard-demo.gif)

The demo now shows the actual product rhythm: ready state, compare fan-out, workflow staging, and a completed comparison board.

### Compare View

![Prompt Switchboard compare detail showing model cards, status chips, copy action, and open-site action.](./docs/assets/prompt-switchboard-compare-detail.png)

This detail view highlights the compare-first design with the current next-step lane: one prompt header, WorkflowPanel, analyst guidance, clear model identity, delivery status chips, and direct links back to the original site.

### Trust Boundary Map

![Prompt Switchboard workflow diagram showing open sites, ask once, compare clearly, and the local-first trust boundary.](./docs/assets/prompt-switchboard-workflow.svg)

The workflow map makes the runtime boundary explicit: Prompt Switchboard orchestrates the browser-side flow, while the supported AI websites remain the actual execution surfaces.

### Settings And Portability

![Prompt Switchboard settings view with data export, import, language, theme, and keyboard preferences.](./docs/assets/prompt-switchboard-settings.png)

Settings keep the project honest as a real tool, not just a hero screenshot: export and import, language, theme, and keyboard preferences all live inside the extension.

## Supported Sites

- ChatGPT
- Gemini
- Perplexity
- Qwen
- Grok / xAI

These integrations depend on live DOM structure. When a supported site changes markup, Prompt Switchboard may need selector updates before the compare flow fully recovers.

Need the public-facing install and support detail page? Read [`docs/supported-sites.html`](./docs/supported-sites.html).

## Good Fit / Not The Goal

**Good fit**

- You already use multiple AI chat sites and want a faster way to compare answers.
- You want the trust boundary to stay inside the browser instead of adding another hosted layer.
- You want session history and settings to stay local-first.

**Not the goal**

- A cloud dashboard that proxies prompts through a backend.
- A provider-neutral SDK for arbitrary model APIs.
- A browser automation framework for non-supported websites.
- A generic AI chat app that replaces the compare-first browser workflow.

## FAQ

### Does Prompt Switchboard proxy my prompts through a hosted backend?

No. The repository build stays local-first and uses the browser sessions you already have on supported sites.

### Does this build ship direct browser-side BYOK API execution?

No. Prompt Switchboard still does **not** execute provider API keys directly in the browser build. The browser-session analyst lane reuses a tab you already trust, and the optional Switchyard runtime lane only works through a separate local runtime service.

### Does the MCP sidecar expose arbitrary browser automation?

No. The MCP surface is product-specific. It exposes Prompt Switchboard actions such as readiness checks, compare runs, retries, exports, session reads, and compare analysis. It does not expose raw DOM selectors or generic page-driving commands.

### What do I need before the first compare run?

You need a Chromium-compatible browser that can load unpacked extensions, plus at least one supported AI chat site already open and signed in.

### Is there a browser-store install today?

Not yet. The supported install path today is the packaged GitHub Release zip. Browser-store submission materials are being kept ready, but GitHub Releases remains the supported install surface today.

### Where should I go for install help, supported sites, or onboarding links?

Use the public support pages for the shortest answers:

- [`docs/install.html`](./docs/install.html)
- [`docs/supported-sites.html`](./docs/supported-sites.html)
- [`docs/trust-boundary.html`](./docs/trust-boundary.html)
- [`docs/faq.html`](./docs/faq.html)

### Is this trying to be a provider SDK or automation platform for any website?

No. Prompt Switchboard is intentionally narrower: it is a compare-first browser extension and operator surface for a defined set of supported AI chat surfaces. The current builder-facing surface is MCP, not a shipped public HTTP API or general-purpose SDK.

### Why does the project talk so much about trust boundaries?

Because that is part of the product value. A big part of the appeal is being able to compare answers without adding another hosted relay between you and the AI sites you already use.

## Support

Use the public issue tracker for non-sensitive bugs, setup questions, or product feedback:

<https://github.com/xiaojiou176-open/multi-ai-sidepanel/issues>

For security-sensitive reports, follow [`SECURITY.md`](./SECURITY.md) instead of opening a detailed public issue.

For open-ended product ideas, workflow discussion, or compare-first feedback, use GitHub Discussions:

<https://github.com/xiaojiou176-open/multi-ai-sidepanel/discussions>

Track packaged builds and release notes on the [Releases page](https://github.com/xiaojiou176-open/multi-ai-sidepanel/releases).

## Why Star It Now

If Prompt Switchboard makes multi-model comparison easier for you, star the repo so the latest packaged builds, selector drift fixes, and compare-first front-door updates stay easy to find.
