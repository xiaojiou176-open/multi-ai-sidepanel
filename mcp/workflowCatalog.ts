export const MCP_WORKFLOW_TEMPLATE_CATALOG = {
  surface: 'workflow_template_catalog',
  durability:
    'session_scoped_runtime_cache',
  durabilityNote:
    'Workflow runs are kept in chrome.storage.session for the current browser session. They are inspectable and resumable during that session, but they are not a durable cold-start ledger.',
  templates: [
    {
      id: 'compare-analyze-follow-up',
      version: '1',
      topology: 'linear',
      publicClaimClass: 'supported_now',
      stepOrder: [
        {
          id: 'compare',
          type: 'compare',
          bindingKeys: ['prompt', 'sessionId', 'models'],
        },
        {
          id: 'analyze',
          type: 'analyze_compare',
          bindingKeys: ['sessionId', 'turnId'],
        },
        {
          id: 'seed-follow-up',
          type: 'seed_follow_up',
          bindingKeys: ['prompt', 'sessionId', 'turnId'],
        },
      ],
      supportedToolFlow: [
        'prompt_switchboard.run_workflow',
        'prompt_switchboard.list_workflow_runs',
        'prompt_switchboard.get_workflow_run',
        'prompt_switchboard.resume_workflow',
      ],
      note:
        'This template is product-bound. It stages or resumes the built-in compare -> analyze -> seed follow-up lane instead of exposing a generic DAG engine.',
    },
  ],
} as const;
