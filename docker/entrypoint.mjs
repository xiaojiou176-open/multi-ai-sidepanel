import { spawn } from 'node:child_process';

const [, , rawCommand = 'help', ...rest] = process.argv;

const serverCommand = ['npm', ['run', 'mcp:server']];
const smokeCommand = ['npm', ['run', 'test:mcp:smoke']];
const operatorCommands = new Set([
  'bridge-status',
  'doctor',
  'help',
  'readiness',
  'support-matrix',
]);

let commandTuple;

if (rawCommand === 'server') {
  commandTuple = serverCommand;
} else if (rawCommand === 'smoke') {
  commandTuple = smokeCommand;
} else if (operatorCommands.has(rawCommand)) {
  commandTuple = ['npm', ['run', 'mcp:operator', '--', rawCommand]];
} else {
  process.stdout.write(`Prompt Switchboard Docker sidecar entrypoint

Usage:
  help            Print this help message.
  doctor          Print the local bridge doctor envelope for the current container/runtime.
  support-matrix  Read the repo-owned builder support matrix through the operator helper.
  bridge-status   Read the current bridge status through the operator helper.
  readiness       Check per-model readiness through the operator helper.
  server          Start the stdio MCP sidecar and the loopback bridge inside the container.
  smoke           Run the repo-owned MCP smoke test inside the container.

Notes:
  - This image wraps the local MCP sidecar/helper surface only.
  - It does not become a hosted compare service or public HTTP API.
  - For host browser access, publish the bridge port with -p 127.0.0.1:48123:48123.
`);
  process.exit(rawCommand === 'help' ? 0 : 1);
}

const [command, args] = commandTuple;
const child = spawn(command, [...args, ...rest], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    const signalExitCodes = {
      SIGINT: 130,
      SIGTERM: 143,
    };
    process.stderr.write(`[docker-entrypoint] child exited via signal ${signal}\n`);
    process.exit(signalExitCodes[signal] ?? 1);
    return;
  }
  process.exit(code ?? 0);
});
