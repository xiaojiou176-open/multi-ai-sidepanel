import { spawnSync } from 'node:child_process';

export const hasLiveRuntimeEvidenceGap = (extension) =>
  Boolean(
    extension &&
      extension.available === false &&
      extension.runtimeEvidence &&
      extension.runtimeEvidence.hasServiceWorker === false &&
      extension.runtimeEvidence.hasContentScriptContext === false
  );

export const runLiveDiagnoseEnvelope = ({
  env = process.env,
  cwd = process.cwd(),
} = {}) => {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsx', 'scripts/verify/live-diagnose.ts'],
    {
      cwd,
      encoding: 'utf8',
      env,
    }
  );

  if (result.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return null;
  }
};

export const collectLivePreflightBlockers = ({
  diagnosisEnvelope,
  preflightBlockerKinds,
}) => {
  const diagnosis = diagnosisEnvelope?.diagnosis;
  const diagnosisBlockers = Array.isArray(diagnosis?.blockers) ? diagnosis.blockers : [];
  const blockers = diagnosisBlockers.filter(
    (blocker) => blocker.surface === 'site' && preflightBlockerKinds.has(blocker.kind)
  );

  if (hasLiveRuntimeEvidenceGap(diagnosisEnvelope?.probe?.extension)) {
    const runtimeBlocker = diagnosisBlockers.find(
      (blocker) => blocker.surface === 'probe' && blocker.kind === 'probe_blocker'
    );

    blockers.push(
      runtimeBlocker || {
        surface: 'probe',
        kind: 'probe_blocker',
        message:
          'Prompt Switchboard did not expose a live extension runtime in the current browser lane.',
      }
    );
  }

  return blockers;
};

export const buildExtensionRuntimeSummaryLines = (extension) => {
  if (!extension) {
    return ['- extension: no extension probe result was captured'];
  }

  const lines = [
    `- available: ${extension.available ? 'yes' : 'no'} | inspectionMode: ${extension.inspectionMode || 'n/a'} | state: ${extension.state} | url: ${extension.url || '[none]'}`,
  ];

  if (extension.runtimeEvidence) {
    const runtimeEvidence = extension.runtimeEvidence;
    lines.push(
      `- serviceWorker: ${
        runtimeEvidence.hasServiceWorker
          ? `detected (${runtimeEvidence.serviceWorkerUrls.join(', ')})`
          : 'missing'
      }`
    );
    lines.push(
      `- contentScriptContext: ${
        runtimeEvidence.hasContentScriptContext
          ? `detected (${runtimeEvidence.contentScriptModels.join(', ')})`
          : 'missing'
      }`
    );
    lines.push(
      `- runtimeIds: ${
        runtimeEvidence.detectedRuntimeIds.length > 0
          ? runtimeEvidence.detectedRuntimeIds.join(', ')
          : 'none'
      }`
    );
  }

  if (extension.errorMessage) {
    lines.push(`- runtimeNote: ${extension.errorMessage}`);
  }

  return lines;
};

export const buildRuntimeInspectionReport = (diagnosisEnvelope) => {
  const extension = diagnosisEnvelope?.probe?.extension || null;
  if (!extension) {
    return null;
  }

  return {
    extensionId: extension.extensionId || null,
    available: extension.available,
    inspectionMode: extension.inspectionMode || null,
    state: extension.state,
    url: extension.url || '',
    runtimeEvidence: extension.runtimeEvidence || null,
    errorMessage: extension.errorMessage || null,
    laneBlocked: hasLiveRuntimeEvidenceGap(extension),
  };
};
