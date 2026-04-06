import process from 'node:process';
import { collectLiveProbe } from './live-probe-shared';
import { sanitizeReportPayload } from '../shared/runtime-governance.mjs';

const result = await collectLiveProbe();
process.stdout.write(`${JSON.stringify(sanitizeReportPayload(result), null, 2)}\n`);
process.exit(0);
