import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  getHelpEnvelope,
  parseOperatorArgv,
  runOperatorCommand,
  runOperatorServer,
} from './operatorShared.js';

type OperatorCliOptions = {
  argv?: string[];
  exit?: (code: number) => void;
  getHelp?: typeof getHelpEnvelope;
  parseArgv?: typeof parseOperatorArgv;
  runCommand?: typeof runOperatorCommand;
  runServer?: typeof runOperatorServer;
  setExitCode?: (code: number) => void;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
};

const writeEnvelope = (stdout: Pick<NodeJS.WriteStream, 'write'>, payload: unknown) =>
  stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

export const createUnhandledOperatorEnvelope = (error: unknown) => ({
  ok: false,
  localOnly: true,
  surface: 'repo_local_operator_helper',
  command: 'help',
  transport: 'none',
  error: {
    code: 'operator_unhandled_error',
    message: error instanceof Error ? error.message : String(error),
  },
  metadata: {
    publicCliProduct: false,
    rationale:
      'This helper stays repo-local even when wired into package scripts because it only wraps the local MCP sidecar and does not become a public CLI product.',
  },
});

export const runOperatorCli = async ({
  argv = process.argv.slice(2),
  exit,
  getHelp,
  parseArgv,
  runCommand,
  runServer,
  setExitCode,
  stdout = process.stdout,
}: OperatorCliOptions = {}) => {
  const parsed = (parseArgv ?? parseOperatorArgv)(argv);
  if (parsed.command === 'help') {
    writeEnvelope(stdout, (getHelp ?? getHelpEnvelope)());
    return;
  }

  if (parsed.command === 'server') {
    const exitCode = await (runServer ?? runOperatorServer)(parsed.options);
    if (exitCode !== 0) {
      (exit ?? process.exit)(exitCode);
    }
    return;
  }

  const envelope = await (runCommand ?? runOperatorCommand)(parsed.command, parsed.options);
  writeEnvelope(stdout, envelope);
  if (!envelope.ok) {
    (setExitCode ??
      ((code: number) => {
        process.exitCode = code;
      }))(1);
  }
};

export const runOperatorCliEntry = async (options: OperatorCliOptions = {}) => {
  try {
    await runOperatorCli(options);
  } catch (error) {
    writeEnvelope(options.stdout ?? process.stdout, createUnhandledOperatorEnvelope(error));
    (options.exit ?? process.exit)(1);
  }
};

export const main = async () => {
  await runOperatorCliEntry();
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  await main();
}
