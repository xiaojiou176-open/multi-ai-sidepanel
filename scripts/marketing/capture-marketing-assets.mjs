import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = process.cwd();
const extensionPath = path.join(repoRoot, 'dist');
const outputDir = path.join(repoRoot, 'docs', 'assets');
const tempUserDataDir = path.join(repoRoot, '.runtime-cache', 'marketing-user-data');
const tempFramesDir = path.join(repoRoot, '.runtime-cache', 'marketing-frames');
const MARKETING_BROWSER_LAUNCH_TIMEOUT_MS = 300_000;
const useHeadlessMarketingBrowser = process.env.MARKETING_BROWSER_HEADLESS === '1';
const generatedAssets = [
  'prompt-switchboard-hero.png',
  'prompt-switchboard-compare-detail.png',
  'prompt-switchboard-workflow-panel.png',
  'prompt-switchboard-analyst-panel.png',
  'prompt-switchboard-builder-surface.png',
  'prompt-switchboard-settings.png',
  'prompt-switchboard-demo.gif',
  'prompt-switchboard-social-preview.png',
];
const staticFrontdoorAssets = [
  'prompt-switchboard-before-after.svg',
  'prompt-switchboard-workflow.svg',
  'prompt-switchboard-nav-icon.svg',
];
const publicFrontdoorAssets = [...generatedAssets, ...staticFrontdoorAssets];

const CURRENT_SCHEMA_VERSION = 3;

const ensureCleanDir = (targetPath) => {
  rmSync(targetPath, { recursive: true, force: true });
  mkdirSync(targetPath, { recursive: true });
};

const ensureDir = (targetPath) => {
  mkdirSync(targetPath, { recursive: true });
};

const runFfmpeg = (args) => {
  const result = spawnSync('ffmpeg', args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed with status ${result.status ?? 'unknown'}`);
  }
};

const buildAssistantMessage = ({
  id,
  model,
  text,
  timestamp,
  turnId,
  requestId,
  deliveryStatus,
  isStreaming = false,
}) => ({
  id,
  role: 'assistant',
  text,
  model,
  timestamp,
  turnId,
  requestId,
  deliveryStatus,
  isStreaming,
  completedAt:
    deliveryStatus === 'streaming' || deliveryStatus === 'pending' ? undefined : timestamp,
});

const buildHeroSession = () => ({
  id: 'hero-session',
  title: 'Launch workflow handoff',
  createdAt: 1_710_000_000_000,
  updatedAt: 1_710_000_000_500,
  selectedModels: ['ChatGPT', 'Gemini', 'Perplexity'],
  messages: [
    {
      id: 'hero-user-1',
      role: 'user',
      text: 'Summarize the launch handoff for a compare-first browser workspace in three bullets.',
      timestamp: 1_710_000_000_000,
      turnId: 'hero-turn-1',
      requestId: 'hero-request-1',
      requestedModels: ['ChatGPT', 'Gemini', 'Perplexity'],
      deliveryStatus: 'complete',
      completedAt: 1_710_000_000_000,
    },
    buildAssistantMessage({
      id: 'hero-assistant-chatgpt',
      model: 'ChatGPT',
      text: '1. Keep compare-first at the center.\n2. Make the next-step workflow obvious.\n3. Keep the trust boundary honest.',
      timestamp: 1_710_000_000_100,
      turnId: 'hero-turn-1',
      requestId: 'hero-request-1',
      deliveryStatus: 'complete',
    }),
    buildAssistantMessage({
      id: 'hero-assistant-gemini',
      model: 'Gemini',
      text: '1. Show WorkflowPanel before builder details.\n2. Let the analyst stay optional.\n3. Keep Codex and Claude Code in the governed builder lane.',
      timestamp: 1_710_000_000_200,
      turnId: 'hero-turn-1',
      requestId: 'hero-request-1',
      deliveryStatus: 'complete',
    }),
    buildAssistantMessage({
      id: 'hero-assistant-perplexity',
      model: 'Perplexity',
      text: '1. Emphasize session-scoped workflow snapshots.\n2. Keep operator helper repo-local.\n3. Avoid any public API or generic automation framing.',
      timestamp: 1_710_000_000_300,
      turnId: 'hero-turn-1',
      requestId: 'hero-request-1',
      deliveryStatus: 'complete',
    }),
  ],
});

const buildHeroPresentationState = () => ({
  selectedModels: ['ChatGPT', 'Gemini', 'Perplexity'],
  analysisByTurn: {
    'hero-turn-1': {
      status: 'success',
      provider: 'browser_session',
      model: 'ChatGPT',
      updatedAt: 1_710_000_000_450,
      result: {
        provider: 'browser_session',
        model: 'ChatGPT',
        createdAt: 1_710_000_000_450,
        consensusSummary: 'The strongest launch story stays compare-first and local-first.',
        disagreementSummary:
          'Gemini leans builder-facing, while Perplexity is stricter about trust-boundary language.',
        recommendedAnswerModel: 'Gemini',
        recommendationReason:
          'Gemini frames the builder lane clearly without turning Prompt Switchboard into a platform story.',
        nextQuestion: 'Which next-step workflow cue should we put in the front door first?',
        synthesisDraft:
          'Lead with compare-first proof, make the workflow panel visible, and keep Codex / Claude Code inside the governed MCP lane.',
      },
    },
  },
  workflowByTurn: {
    'hero-turn-1': {
      turnId: 'hero-turn-1',
      runId: 'hero-workflow-1',
      workflowId: 'compare-analyze-follow-up',
      status: 'seed_ready',
      currentStepId: 'seed-follow-up',
      targetModels: ['ChatGPT', 'Gemini'],
      seedSource: 'next_question',
      seedPrompt: 'Which next-step workflow cue should we put in the front door first?',
      updatedAt: 1_710_000_000_480,
    },
  },
  input: '',
});

const buildGifStates = () => {
  const baseTimestamp = 1_710_100_000_000;
  const requestedModels = ['ChatGPT', 'Gemini', 'Perplexity'];

  return [
    {
      name: 'frame-01',
      local: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessions: [
          {
            id: 'empty-session',
            title: 'Ready to compare',
            createdAt: baseTimestamp,
            updatedAt: baseTimestamp,
            selectedModels: requestedModels,
            messages: [],
          },
        ],
        currentSessionId: 'empty-session',
        settings: {
          language: 'en',
          theme: 'light',
          enterToSend: true,
          doubleClickToEdit: true,
          shortcuts: {},
        },
      },
    },
    {
      name: 'frame-02',
      local: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessions: [
          {
            id: 'pending-session',
            title: 'Prompt fan-out',
            createdAt: baseTimestamp,
            updatedAt: baseTimestamp + 10,
            selectedModels: requestedModels,
            messages: [
              {
                id: 'pending-user',
                role: 'user',
                text: 'Give me a punchy launch tagline for Prompt Switchboard.',
                timestamp: baseTimestamp,
                turnId: 'gif-turn-1',
                requestId: 'gif-request-1',
                requestedModels,
                deliveryStatus: 'complete',
                completedAt: baseTimestamp,
              },
              buildAssistantMessage({
                id: 'pending-chatgpt',
                model: 'ChatGPT',
                text: '',
                timestamp: baseTimestamp + 1,
                turnId: 'gif-turn-1',
                requestId: 'gif-request-1',
                deliveryStatus: 'pending',
                isStreaming: true,
              }),
              buildAssistantMessage({
                id: 'pending-gemini',
                model: 'Gemini',
                text: '',
                timestamp: baseTimestamp + 2,
                turnId: 'gif-turn-1',
                requestId: 'gif-request-1',
                deliveryStatus: 'pending',
                isStreaming: true,
              }),
              buildAssistantMessage({
                id: 'pending-perplexity',
                model: 'Perplexity',
                text: '',
                timestamp: baseTimestamp + 3,
                turnId: 'gif-turn-1',
                requestId: 'gif-request-1',
                deliveryStatus: 'pending',
                isStreaming: true,
              }),
            ],
          },
        ],
        currentSessionId: 'pending-session',
        settings: {
          language: 'en',
          theme: 'light',
          enterToSend: true,
          doubleClickToEdit: true,
          shortcuts: {},
        },
      },
    },
    {
      name: 'frame-03',
      local: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessions: [
          {
            id: 'streaming-session',
            title: 'Compare-first launch',
            createdAt: baseTimestamp,
            updatedAt: baseTimestamp + 20,
            selectedModels: requestedModels,
            messages: [
              {
                id: 'streaming-user',
                role: 'user',
                text: 'Draft a one-line product description and two trust signals.',
                timestamp: baseTimestamp,
                turnId: 'gif-turn-2',
                requestId: 'gif-request-2',
                requestedModels,
                deliveryStatus: 'complete',
                completedAt: baseTimestamp,
              },
              buildAssistantMessage({
                id: 'streaming-chatgpt',
                model: 'ChatGPT',
                text: 'Compare multiple AI chats from one local side panel.',
                timestamp: baseTimestamp + 1,
                turnId: 'gif-turn-2',
                requestId: 'gif-request-2',
                deliveryStatus: 'complete',
              }),
              buildAssistantMessage({
                id: 'streaming-gemini',
                model: 'Gemini',
                text: 'Trust signal 1: uses your existing sessions.\nTrust signal 2: no hosted relay...',
                timestamp: baseTimestamp + 2,
                turnId: 'gif-turn-2',
                requestId: 'gif-request-2',
                deliveryStatus: 'streaming',
                isStreaming: true,
              }),
              buildAssistantMessage({
                id: 'streaming-perplexity',
                model: 'Perplexity',
                text: '',
                timestamp: baseTimestamp + 3,
                turnId: 'gif-turn-2',
                requestId: 'gif-request-2',
                deliveryStatus: 'pending',
                isStreaming: true,
              }),
            ],
          },
        ],
        currentSessionId: 'streaming-session',
        settings: {
          language: 'en',
          theme: 'light',
          enterToSend: true,
          doubleClickToEdit: true,
          shortcuts: {},
        },
      },
    },
    {
      name: 'frame-04',
      local: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessions: [
          {
            id: 'complete-session',
            title: 'Ship the front door',
            createdAt: baseTimestamp,
            updatedAt: baseTimestamp + 30,
            selectedModels: requestedModels,
            messages: [
              {
                id: 'complete-user',
                role: 'user',
                text: 'Explain why local-first matters for an AI comparison extension.',
                timestamp: baseTimestamp,
                turnId: 'gif-turn-3',
                requestId: 'gif-request-3',
                requestedModels,
                deliveryStatus: 'complete',
                completedAt: baseTimestamp,
              },
              buildAssistantMessage({
                id: 'complete-chatgpt',
                model: 'ChatGPT',
                text: 'It keeps prompt routing inside the browser and makes the trust boundary obvious.',
                timestamp: baseTimestamp + 1,
                turnId: 'gif-turn-3',
                requestId: 'gif-request-3',
                deliveryStatus: 'complete',
              }),
              buildAssistantMessage({
                id: 'complete-gemini',
                model: 'Gemini',
                text: 'Users can compare answers without handing prompts to another hosted relay service.',
                timestamp: baseTimestamp + 2,
                turnId: 'gif-turn-3',
                requestId: 'gif-request-3',
                deliveryStatus: 'complete',
              }),
              buildAssistantMessage({
                id: 'complete-perplexity',
                model: 'Perplexity',
                text: 'The extension becomes easier to trust because it reuses the tabs and sessions users already control.',
                timestamp: baseTimestamp + 3,
                turnId: 'gif-turn-3',
                requestId: 'gif-request-3',
                deliveryStatus: 'complete',
              }),
            ],
          },
        ],
        currentSessionId: 'complete-session',
        settings: {
          language: 'en',
          theme: 'light',
          enterToSend: true,
          doubleClickToEdit: true,
          shortcuts: {},
        },
        presentationState: {
          selectedModels: requestedModels,
          analysisByTurn: {
            'gif-turn-3': {
              status: 'success',
              provider: 'browser_session',
              model: 'ChatGPT',
              updatedAt: baseTimestamp + 40,
              result: {
                provider: 'browser_session',
                model: 'ChatGPT',
                createdAt: baseTimestamp + 40,
                consensusSummary: 'Local-first keeps the trust boundary understandable.',
                disagreementSummary:
                  'One answer emphasizes trust, while another emphasizes product clarity.',
                recommendedAnswerModel: 'Gemini',
                recommendationReason:
                  'Gemini keeps the launch framing clear without overselling automation.',
                nextQuestion: 'Which launch proof should the next compare turn validate?',
                synthesisDraft:
                  'Keep the compare lane primary, stage the next move honestly, and leave hosted claims out.',
              },
            },
          },
          workflowByTurn: {
            'gif-turn-3': {
              turnId: 'gif-turn-3',
              runId: 'gif-workflow-3',
              workflowId: 'compare-analyze-follow-up',
              status: 'seed_ready',
              currentStepId: 'seed-follow-up',
              targetModels: requestedModels,
              seedSource: 'next_question',
              seedPrompt: 'Which launch proof should the next compare turn validate?',
              updatedAt: baseTimestamp + 45,
            },
          },
          input: '',
        },
      },
    },
  ];
};

const seedExtensionState = async (page, localState) => {
  await page.getByText('Prompt Switchboard', { exact: true }).waitFor();
  await page.evaluate(async (payload) => {
    const hook = window.__promptSwitchboard;
    if (!hook?.replaceSessions) {
      throw new Error('missing prompt switchboard diagnostic hook');
    }

    await hook.replaceSessions(payload.sessions, payload.currentSessionId);
    if (hook.seedPresentationState) {
      hook.seedPresentationState(
        payload.presentationState ?? {
          analysisByTurn: {},
          workflowByTurn: {},
          input: '',
          selectedModels: payload.sessions[0]?.selectedModels ?? ['ChatGPT'],
        }
      );
    }
    if (hook.setViewMode) {
      hook.setViewMode('compare');
    }

    await chrome.storage.local.set({
      schemaVersion: payload.schemaVersion,
      settings: payload.settings,
    });
  }, localState);
  await page.waitForTimeout(250);
};

const createSocialPreview = async (context) => {
  const socialPage = await context.newPage();
  await socialPage.setViewportSize({ width: 1280, height: 640 });

  await socialPage.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            width: 1280px;
            height: 640px;
            display: grid;
            grid-template-columns: 0.78fr 1.22fr;
            gap: 26px;
            padding: 28px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #0f172a;
            background:
              radial-gradient(circle at top left, rgba(244, 114, 182, 0.30), transparent 34%),
              radial-gradient(circle at bottom right, rgba(251, 191, 36, 0.26), transparent 28%),
              linear-gradient(145deg, #fff9fc 0%, #fff3e7 100%);
          }
          .panel {
            border-radius: 32px;
            background: rgba(255,255,255,0.86);
            border: 1px solid rgba(255,255,255,0.88);
            box-shadow: 0 20px 70px rgba(15, 23, 42, 0.08);
            backdrop-filter: blur(14px);
          }
          .copy {
            padding: 24px;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .eyebrow {
            display: inline-flex;
            width: fit-content;
            padding: 8px 12px;
            border-radius: 999px;
            border: 1px solid #fbcfe8;
            background: #fff1f6;
            color: #be185d;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }
          h1 {
            margin: 18px 0 0;
            font-size: 56px;
            line-height: 0.98;
            letter-spacing: -0.04em;
          }
          p {
            margin: 18px 0 0;
            font-size: 21px;
            line-height: 1.42;
            color: #475569;
          }
          .chips {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 24px;
          }
          .chip {
            padding: 10px 14px;
            border-radius: 999px;
            background: white;
            border: 1px solid #e2e8f0;
            font-size: 14px;
            font-weight: 600;
            color: #334155;
          }
          .model-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 22px;
            color: #64748b;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .preview {
            position: relative;
            overflow: hidden;
            padding: 16px;
            display: flex;
            align-items: center;
            width: 100%;
            height: 100%;
            border-radius: 24px;
            border: 1px solid rgba(251, 113, 133, 0.16);
            box-shadow: 0 18px 50px rgba(244, 114, 182, 0.18);
            background: linear-gradient(180deg, #fffdfb 0%, #fff7ef 100%);
          }
          .preview::after {
            content: "";
            position: absolute;
            right: -40px;
            bottom: -120px;
            width: 220px;
            height: 220px;
            border-radius: 999px;
            background: rgba(251, 191, 36, 0.16);
            filter: blur(16px);
          }
          .board {
            position: relative;
            z-index: 1;
            height: 100%;
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            gap: 14px;
          }
          .composer {
            padding: 16px 18px 18px;
            border-radius: 22px;
            border: 1px solid rgba(251, 113, 133, 0.16);
            background: linear-gradient(180deg, rgba(255, 250, 246, 0.98), rgba(255, 245, 236, 0.96));
          }
          .composer-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }
          .composer-label {
            display: inline-flex;
            padding: 7px 12px;
            border-radius: 999px;
            background: #fff1f6;
            border: 1px solid #fbcfe8;
            color: #be185d;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }
          .composer-hint {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            color: #64748b;
          }
          .composer-box {
            margin-top: 14px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 12px;
            align-items: center;
            padding: 14px 14px 14px 16px;
            border-radius: 18px;
            background: rgba(255,255,255,0.92);
            border: 1px solid rgba(226,232,240,0.95);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
          }
          .composer-input {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.03em;
            color: #0f172a;
          }
          .composer-send {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 11px 14px;
            border-radius: 14px;
            background: linear-gradient(135deg, #ec4899, #f97316);
            color: white;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }
          .fanout {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 12px;
            align-items: center;
          }
          .fanout-label {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 116px;
            min-height: 100%;
            padding: 12px 14px;
            border-radius: 18px;
            background: rgba(15, 23, 42, 0.94);
            color: white;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .fanout-chips {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }
          .fanout-chip {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            border-radius: 999px;
            background: rgba(255,255,255,0.94);
            border: 1px solid rgba(226,232,240,0.95);
            color: #334155;
            font-size: 13px;
            font-weight: 600;
          }
          .dot {
            width: 9px;
            height: 9px;
            border-radius: 999px;
            background: linear-gradient(135deg, #34d399, #10b981);
          }
          .cards {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }
          .card {
            border-radius: 22px;
            border: 1px solid rgba(226,232,240,0.95);
            background: rgba(255,255,255,0.94);
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .card.chatgpt {
            background: linear-gradient(180deg, rgba(240, 253, 250, 0.98), rgba(255,255,255,0.96));
          }
          .card.gemini {
            background: linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(255,255,255,0.96));
          }
          .card.perplexity {
            background: linear-gradient(180deg, rgba(255, 251, 235, 0.98), rgba(255,255,255,0.96));
          }
          .card-head {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .card-name {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
          }
          .card-icon {
            width: 32px;
            height: 32px;
            border-radius: 14px;
            display: grid;
            place-items: center;
            border: 1px solid rgba(251, 113, 133, 0.16);
            background: linear-gradient(180deg, #fffdfd, #fff7fb);
            color: #475569;
            font-size: 14px;
            font-weight: 700;
          }
          .status {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            padding: 6px 10px;
            border-radius: 999px;
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            color: #047857;
            font-size: 12px;
            font-weight: 700;
          }
          .card-copy {
            font-size: 18px;
            line-height: 1.18;
            letter-spacing: -0.03em;
            font-weight: 800;
            color: #0f172a;
          }
          .card-body {
            border-radius: 18px;
            border: 1px solid rgba(226,232,240,0.95);
            background: linear-gradient(180deg, #ffffff, #fffdfb);
            padding: 12px 14px;
            color: #334155;
            font-size: 13px;
            line-height: 1.45;
          }
          .footer-strip {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }
          .footer-chip {
            padding: 9px 12px;
            border-radius: 999px;
            background: rgba(255,255,255,0.92);
            border: 1px solid rgba(226,232,240,0.95);
            color: #334155;
            font-size: 12px;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <section class="panel copy">
          <span class="eyebrow">Prompt Switchboard</span>
          <h1>Ask once. Compare AI answers side by side.</h1>
          <p>Line up ChatGPT, Gemini, Perplexity, Qwen, and Grok from one local browser side panel instead of bouncing between tabs.</p>
          <div class="chips">
            <span class="chip">Local-first</span>
            <span class="chip">Reuse signed-in tabs</span>
            <span class="chip">Compare best-fit answers fast</span>
          </div>
          <div class="model-row">ChatGPT • Gemini • Perplexity • Qwen • Grok</div>
        </section>
        <section class="panel preview">
          <div class="board">
            <section class="composer">
              <div class="composer-meta">
                <span class="composer-label">Ask once</span>
                <span class="composer-hint">One prompt in</span>
              </div>
              <div class="composer-box">
                <span class="composer-input">Write a one-line launch hook and one proof point.</span>
                <span class="composer-send">Send</span>
              </div>
            </section>
            <div class="fanout">
              <span class="fanout-label">Fans out</span>
              <div class="fanout-chips">
                <span class="fanout-chip"><span class="dot"></span> 3 aligned answers</span>
                <span class="fanout-chip"><span class="dot"></span> Compare board</span>
                <span class="fanout-chip"><span class="dot"></span> +2 more models</span>
              </div>
            </div>
            <div class="cards">
              <article class="card chatgpt">
                <div class="card-head">
                  <div class="card-name">
                    <span class="card-icon">C</span>
                    <span>ChatGPT</span>
                  </div>
                </div>
                <span class="status">Complete</span>
                <div class="card-copy">Ask once, compare faster across your AI tabs.</div>
                <div class="card-body">
                  One prompt enters the side panel, then the board keeps every answer aligned.
                </div>
              </article>
              <article class="card gemini">
                <div class="card-head">
                  <div class="card-name">
                    <span class="card-icon">G</span>
                    <span>Gemini</span>
                  </div>
                </div>
                <span class="status">Complete</span>
                <div class="card-copy">Keep the trust boundary inside your own browser.</div>
                <div class="card-body">
                  Reuse the signed-in tabs you already control instead of adding a hosted relay.
                </div>
              </article>
              <article class="card perplexity">
                <div class="card-head">
                  <div class="card-name">
                    <span class="card-icon">P</span>
                    <span>Perplexity</span>
                  </div>
                </div>
                <span class="status">Complete</span>
                <div class="card-copy">Spot the strongest answer and copy the best-fit result fast.</div>
                <div class="card-body">
                  Compare side by side, reopen the source tab, or keep the run saved locally.
                </div>
              </article>
            </div>
            <div class="footer-strip">
              <span class="footer-chip">Local side panel</span>
              <span class="footer-chip">Side-by-side compare</span>
              <span class="footer-chip">Copy best-fit answer</span>
            </div>
          </div>
        </section>
      </body>
    </html>
  `);

  await socialPage.screenshot({
    path: path.join(outputDir, 'prompt-switchboard-social-preview.png'),
  });
  await socialPage.close();
};

const main = async () => {
  ensureDir(outputDir);
  for (const assetName of generatedAssets) {
    rmSync(path.join(outputDir, assetName), { force: true });
  }
  ensureCleanDir(tempFramesDir);
  ensureCleanDir(tempUserDataDir);

  const context = await chromium.launchPersistentContext(tempUserDataDir, {
    headless: useHeadlessMarketingBrowser,
    timeout: MARKETING_BROWSER_LAUNCH_TIMEOUT_MS,
    viewport: { width: 1680, height: 1080 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--disable-gpu',
    ],
  });

  try {
    const serviceWorker =
      context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(serviceWorker.url()).host;
    const extensionPrefix = `chrome-extension://${extensionId}`;

    const heroPage = await context.newPage();
    await heroPage.goto(`${extensionPrefix}/index.html`, { waitUntil: 'domcontentloaded' });
    await seedExtensionState(heroPage, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sessions: [buildHeroSession()],
      currentSessionId: 'hero-session',
      presentationState: buildHeroPresentationState(),
      settings: {
        language: 'en',
        theme: 'light',
        enterToSend: true,
        doubleClickToEdit: true,
        shortcuts: {},
      },
    });
    await heroPage.waitForFunction(
      () => document.querySelectorAll('[data-testid^="compare-card-"]').length > 0
    );
    await heroPage.getByText('Next compare seed is ready').waitFor();

    await heroPage.screenshot({
      path: path.join(outputDir, 'prompt-switchboard-hero.png'),
    });

    await heroPage
      .locator('[data-testid="compare-turn-0"]')
      .screenshot({ path: path.join(outputDir, 'prompt-switchboard-compare-detail.png') });
    await heroPage
      .getByTestId('workflow-panel-hero-turn-1')
      .screenshot({ path: path.join(outputDir, 'prompt-switchboard-workflow-panel.png') });
    await heroPage
      .getByTestId('compare-analyst-panel-hero-turn-1')
      .screenshot({ path: path.join(outputDir, 'prompt-switchboard-analyst-panel.png') });

    await heroPage.goto(`${extensionPrefix}/index.html`, { waitUntil: 'domcontentloaded' });
    await heroPage.getByText('Prompt Switchboard', { exact: true }).waitFor();
    await heroPage.evaluate(() => {
      window.__promptSwitchboard?.openSettings?.();
    });
    await heroPage.getByTestId('settings-panel').waitFor();
    await heroPage
      .locator('[data-testid="settings-panel"]')
      .screenshot({ path: path.join(outputDir, 'prompt-switchboard-settings.png') });
    await heroPage.close();

    const builderPage = await context.newPage();
    await builderPage.goto(
      pathToFileURL(path.join(repoRoot, 'docs', 'mcp-coding-agents.html')).href,
      { waitUntil: 'domcontentloaded' }
    );
    const operatorHelperHeading = builderPage.getByRole('heading', {
      name: 'Repo-local operator helper',
    });
    await builderPage
      .locator('section.card')
      .filter({ has: operatorHelperHeading })
      .screenshot({ path: path.join(outputDir, 'prompt-switchboard-builder-surface.png') });
    await builderPage.close();

    const gifPage = await context.newPage();
    await gifPage.goto(`${extensionPrefix}/index.html`, { waitUntil: 'domcontentloaded' });
    const gifStates = buildGifStates();

    for (const [index, state] of gifStates.entries()) {
      await seedExtensionState(gifPage, state.local);
      if (state.local.sessions[0].messages.length > 0) {
        await gifPage.getByTestId('compare-view').waitFor();
      } else {
        await gifPage.getByTestId('compare-empty-state').waitFor();
      }

      await gifPage.screenshot({
        path: path.join(tempFramesDir, `${String(index + 1).padStart(2, '0')}.png`),
      });
    }
    await gifPage.close();

    const palettePath = path.join(tempFramesDir, 'palette.png');
    runFfmpeg([
      '-y',
      '-framerate',
      '1',
      '-i',
      path.join(tempFramesDir, '%02d.png'),
      '-frames:v',
      '1',
      '-vf',
      'fps=1,scale=1440:-1:flags=lanczos,palettegen',
      '-update',
      '1',
      palettePath,
    ]);
    runFfmpeg([
      '-y',
      '-framerate',
      '1',
      '-i',
      path.join(tempFramesDir, '%02d.png'),
      '-i',
      palettePath,
      '-lavfi',
      'fps=1,scale=1440:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5',
      path.join(outputDir, 'prompt-switchboard-demo.gif'),
    ]);

    await createSocialPreview(context);
    console.log(`[marketing:assets] generated capture assets: ${generatedAssets.join(', ')}`);
    console.log(
      `[marketing:assets] tracked static front-door assets: ${staticFrontdoorAssets.join(', ')}`
    );
    console.log(
      `[marketing:assets] public front-door asset roster: ${publicFrontdoorAssets.join(', ')}`
    );
  } finally {
    await context.close();
    rmSync(tempFramesDir, { recursive: true, force: true });
    rmSync(tempUserDataDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error('[marketing:assets] failed:', error);
  process.exit(1);
});
