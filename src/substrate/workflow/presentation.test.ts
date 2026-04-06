import { describe, expect, it } from 'vitest';
import { presentWorkflowRun } from './presentation';

describe('workflow presentation', () => {
  it('extracts seed prompt and readable step labels from a completed workflow detail', () => {
    const presentation = presentWorkflowRun({
      runId: 'run-1',
      workflowId: 'compare-analyze-follow-up',
      status: 'completed',
      requestedAt: 1,
      startedAt: 1,
      finishedAt: 2,
      currentStepId: 'seed-follow-up',
      steps: [],
      output: {
        type: 'seed_follow_up',
        prompt: 'What should we compare next?',
      },
    });

    expect(presentation.currentStepLabel).toBe('Seed next compare');
    expect(presentation.seedPrompt).toBe('What should we compare next?');
    expect(presentation.nextActionSummary).toBeUndefined();
  });

  it('creates a human-readable next action and resume template for waiting compare work', () => {
    const presentation = presentWorkflowRun({
      runId: 'run-2',
      workflowId: 'compare-analyze-follow-up',
      status: 'waiting_external',
      requestedAt: 1,
      startedAt: 1,
      currentStepId: 'compare',
      emittedAction: {
        command: 'compare',
        stepId: 'compare',
        args: {
          prompt: 'Stage the next move',
          sessionId: 'session-1',
          models: ['ChatGPT', 'Gemini'],
        },
      },
    });

    expect(presentation.currentStepLabel).toBe('Compare');
    expect(presentation.nextActionLabel).toBe('Compare');
    expect(presentation.nextActionSummary).toContain('Run Compare for ChatGPT, Gemini');
    expect(presentation.resumeTemplate).toEqual({
      stepId: 'compare',
      status: 'completed',
      output: {
        type: 'compare',
        prompt: 'Stage the next move',
        sessionId: 'session-1',
        turnId: '<turn-id>',
        requestId: null,
        requestedModels: ['ChatGPT', 'Gemini'],
        completedModels: ['ChatGPT', 'Gemini'],
      },
    });
  });
});
