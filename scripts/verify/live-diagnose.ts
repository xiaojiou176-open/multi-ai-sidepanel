import process from 'node:process';
import { buildLiveDiagnosis, collectLiveProbe } from './live-probe-shared';

const probe = await collectLiveProbe();
const diagnosis = probe.readyToProbe
  ? buildLiveDiagnosis(probe)
  : {
      mode: 'prompt_switchboard_live_diagnose',
      generatedAt: new Date().toISOString(),
      status: 'blocked' as const,
      blockers: probe.blockers.map((message) => ({
        surface: 'probe' as const,
        kind: 'probe_blocker' as const,
        message,
      })),
      nextActions: ['Resolve the probe blockers, then rerun the live diagnosis.'],
      effectiveRun: probe.effectiveRun,
    };

process.stdout.write(
  `${JSON.stringify(
    {
      probe,
      diagnosis,
    },
    null,
    2
  )}\n`
);
process.exit(0);
