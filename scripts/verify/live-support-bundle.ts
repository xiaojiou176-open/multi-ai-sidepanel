import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildLiveDiagnosis,
  collectLiveProbe,
  resolveLiveProbeConfig,
  withLiveProbeContext,
} from './live-probe-shared';
import { withExistingExtensionTarget } from './live-extension-target';
import { buildExtensionRuntimeSummaryLines } from './live-runtime-gates.mjs';
import { getModelConfig } from '../../src/utils/modelConfig';
import { getSiteCapability } from '../../src/utils/siteCapabilityMatrix';

const slugNow = () => new Date().toISOString().replace(/[:.]/g, '-');

const bundleDir = path.resolve(
  process.cwd(),
  '.runtime-cache',
  'live-site-runs',
  slugNow()
);
fs.mkdirSync(bundleDir, { recursive: true });

const config = resolveLiveProbeConfig();
const probe = await collectLiveProbe(config);
const diagnosis = probe.readyToProbe
  ? buildLiveDiagnosis(probe)
  : {
      mode: 'prompt_switchboard_live_diagnose',
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      blockers: probe.blockers.map((message) => ({
        surface: 'probe' as const,
        kind: 'probe_blocker' as const,
        message,
      })),
      nextActions: ['Resolve the probe blockers, then rerun the live support bundle.'],
      effectiveRun: probe.effectiveRun,
    };

const writeTextFile = (filename: string, content: string) => {
  fs.writeFileSync(path.join(bundleDir, filename), content, 'utf8');
};

const sanitize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const hasRuntimeEvidenceGap = Boolean(
  probe.extension?.runtimeEvidence &&
    probe.extension.runtimeEvidence.hasServiceWorker === false &&
    probe.extension.runtimeEvidence.hasContentScriptContext === false
);

const captureDeepText = async (page: import('@playwright/test').Page) =>
  await page.evaluate(() => {
    const seen = new Set<Node>();
    const chunks: string[] = [];
    const walk = (node: Node | null) => {
      if (!node || seen.has(node)) {
        return;
      }
      seen.add(node);
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const text = (element as HTMLElement).innerText?.trim?.() || '';
        if (text) {
          chunks.push(text);
        }
        if ((element as HTMLElement).shadowRoot) {
          walk((element as HTMLElement).shadowRoot);
        }
        for (const child of Array.from(element.children)) {
          walk(child);
        }
      } else if (
        node.nodeType === Node.DOCUMENT_NODE ||
        node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ) {
        for (const child of Array.from(node.childNodes)) {
          walk(child);
        }
      }
    };

    walk(document);
    return Array.from(new Set(chunks)).join('\n---\n');
  });

const summaryLines = [
  '# Prompt Switchboard live support bundle',
  '',
  `- generatedAt: ${probe.generatedAt}`,
  `- status: ${diagnosis.status}`,
  `- attachModeResolved: ${probe.effectiveRun.attachModeResolved}`,
  `- browserChannel: ${probe.effectiveRun.browserChannel}`,
  `- userDataDir: ${probe.effectiveRun.userDataDir}`,
  `- profileDirectory: ${probe.effectiveRun.profileDirectory}`,
  '',
  '## Model states',
  '',
  ...probe.models.map(
    (site) =>
      `- ${site.model}: ${site.state} | readiness=${site.readinessStatus} | prompt=${site.hasPromptSurface ? 'yes' : 'no'} | response=${site.hasResponseSurface ? 'yes' : 'no'} | stop=${site.hasStopControl ? 'visible' : 'hidden'} | nextAction: ${site.nextAction} | url: ${site.url || '[not open]'}`
  ),
  '',
  '## Extension runtime',
  '',
  ...buildExtensionRuntimeSummaryLines(probe.extension),
  '',
  '## Site capability notes',
  '',
  ...probe.models.map((site) => {
    const capability = getSiteCapability(site.model);
    return `- ${site.model}: inputSurface=${capability.inputSurface}; stable=${capability.stableSelectors.join(', ')}; fragile=${capability.fragileSelectors.join(', ')}; privateApiBoundary=${capability.privateApiBoundary.observedClass}`;
  }),
  '',
  '## Blockers',
  '',
  ...(diagnosis.blockers.length > 0
    ? diagnosis.blockers.map(
        (blocker) =>
          `- ${blocker.surface}${'model' in blocker && blocker.model ? ` / ${blocker.model}` : ''} / ${blocker.kind}${'readinessStatus' in blocker && blocker.readinessStatus ? ` / ${blocker.readinessStatus}` : ''}: ${blocker.message}`
      )
    : ['- none']),
  '',
  '## Next actions',
  '',
  ...(diagnosis.nextActions.length > 0
    ? diagnosis.nextActions.map((line) => `- ${line}`)
    : ['- none']),
];

writeTextFile('probe.json', `${JSON.stringify(probe, null, 2)}\n`);
writeTextFile('diagnosis.json', `${JSON.stringify(diagnosis, null, 2)}\n`);
writeTextFile(
  'extension-runtime.json',
  `${JSON.stringify(probe.extension?.runtimeEvidence ?? null, null, 2)}\n`
);
if (probe.extension?.errorMessage) {
  writeTextFile('extension-runtime.txt', `${probe.extension.errorMessage}\n`);
}
writeTextFile(
  'site-capability-matrix.json',
  `${JSON.stringify(
    probe.models.map((site) => getSiteCapability(site.model)),
    null,
    2
  )}\n`
);
writeTextFile('summary.md', `${summaryLines.join('\n')}\n`);

if (probe.readyToProbe) {
  await withLiveProbeContext(config, async (context) => {
    for (const site of probe.models) {
      const { hostnames } = getModelConfig(site.model);
      const page = context.pages().find((candidate) => {
        try {
          const hostname = new URL(candidate.url()).hostname;
          return hostnames.some((host) => hostname === host || hostname.endsWith(`.${host}`));
        } catch {
          return false;
        }
      });

      if (!page) {
        continue;
      }

      const prefix = sanitize(site.model);
      try {
        await page.screenshot({ path: path.join(bundleDir, `${prefix}.png`) });
      } catch {
        // Best-effort support bundle.
      }
      try {
        writeTextFile(`${prefix}.html`, await page.content());
        writeTextFile(
          `${prefix}.txt`,
          (await page.evaluate(() => document.body?.innerText || '')).replace(/\s+/g, ' ')
        );
      } catch {
        // Best-effort support bundle.
      }
    }

    if (probe.extension?.available) {
      const extensionPage = context.pages().find((page) => page.url().startsWith('chrome-extension://'));
      if (extensionPage) {
        try {
          await extensionPage.screenshot({ path: path.join(bundleDir, 'extension.png') });
          writeTextFile('extension.html', await extensionPage.content());
          writeTextFile(
            'extension.txt',
            (await extensionPage.evaluate(() => document.body?.innerText || '')).replace(/\s+/g, ' ')
          );
        } catch {
          // Best-effort support bundle.
        }
      } else if (
        probe.extension.inspectionMode === 'cdp_existing_target' &&
        probe.effectiveRun.cdpUrl &&
        probe.extension.extensionId
      ) {
        try {
          await withExistingExtensionTarget(
            probe.effectiveRun.cdpUrl,
            probe.extension.extensionId,
            async (client) => {
              const [snapshot, screenshot] = await Promise.all([
                client.evaluate<{ html: string; text: string }>(`(() => ({
                  html: document.documentElement.outerHTML,
                  text: (document.body?.innerText || '').replace(/\\s+/g, ' ')
                }))()`),
                client.captureScreenshotPng(),
              ]);
              fs.writeFileSync(path.join(bundleDir, 'extension.png'), screenshot);
              writeTextFile('extension.html', snapshot.html);
              writeTextFile('extension.txt', snapshot.text);
            }
          );
        } catch {
          // Best-effort support bundle.
        }
      }
    }

    if (hasRuntimeEvidenceGap) {
      for (const [filename, chromeUrl] of [
        ['chrome-management.txt', 'chrome://management'],
        ['chrome-policy.txt', 'chrome://policy'],
      ]) {
        try {
          const page = await context.newPage();
          await page.goto(chromeUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
          await page.waitForTimeout(1_000);
          writeTextFile(filename, await captureDeepText(page));
          await page.close().catch(() => undefined);
        } catch {
          // Best-effort support bundle.
        }
      }
    }

    return null;
  });
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      mode: 'prompt_switchboard_live_support_bundle',
      bundleDir,
      diagnosisStatus: diagnosis.status,
      blockerCount: diagnosis.blockers.length,
    },
    null,
    2
  )}\n`
);
process.exit(0);
