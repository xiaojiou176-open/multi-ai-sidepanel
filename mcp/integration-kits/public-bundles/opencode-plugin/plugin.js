import { tool } from '@opencode-ai/plugin';

const guideText = `Prompt Switchboard OpenCode bootstrap

1. Keep the MCP server local:
   npm --prefix /absolute/path/to/multi-ai-sidepanel run mcp:server
2. Put the MCP block into project-root opencode.jsonc
3. First smoke:
   - prompt_switchboard.bridge_status
   - prompt_switchboard.check_readiness
   - prompt_switchboard.compare
4. Full follow-through:
   - prompt_switchboard.analyze_compare
   - prompt_switchboard.run_workflow
   - prompt_switchboard.get_workflow_run
   - prompt_switchboard.list_workflow_runs
   - prompt_switchboard.resume_workflow

Truth boundary:
- Prompt Switchboard stays compare-first, local-first, and browser-native
- This packet is not a hosted relay, SDK, or generic automation shell
- The package scaffold exists here, but the npm listing is not published yet`;

export const PromptSwitchboardPlugin = async () => ({
  tool: {
    prompt_switchboard_bootstrap: tool({
      description: 'Print the Prompt Switchboard OpenCode bootstrap and smoke flow.',
      args: {},
      async execute() {
        return guideText;
      },
    }),
  },
});

export default PromptSwitchboardPlugin;
