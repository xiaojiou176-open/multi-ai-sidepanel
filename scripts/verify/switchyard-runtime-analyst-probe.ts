import { runSwitchyardCompareAnalysis } from '../../src/background/switchyardRuntime.js';
import type { ModelName } from '../../src/utils/types.js';

const parseOption = (flag: string) => {
  const index = process.argv.findIndex((entry) => entry === flag || entry.startsWith(`${flag}=`));
  if (index < 0) return undefined;
  const token = process.argv[index];
  if (!token) return undefined;
  if (token.includes('=')) {
    return token.split('=', 2)[1];
  }
  return process.argv[index + 1];
};

const model = (parseOption('--model') ?? 'Gemini') as ModelName;
const prompt =
  parseOption('--prompt') ??
  'Reply with exactly PROMPT_SWITCHBOARD_RUNTIME_OK and nothing else.';

const result = await runSwitchyardCompareAnalysis({
  analystModel: model,
  prompt,
});

console.log(
  JSON.stringify(
    {
      surface: 'prompt-switchboard-switchyard-runtime-probe',
      model,
      prompt,
      result,
    },
    null,
    2,
  ),
);
