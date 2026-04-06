import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowPanel } from './WorkflowPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe('WorkflowPanel', () => {
  it('renders a runnable workflow state and allows the user to start the workflow', () => {
    const onRunWorkflow = vi.fn();
    const { getByText, getByRole } = render(
      <WorkflowPanel
        turnId="turn-1"
        status="runnable"
        targetModels={['ChatGPT', 'Gemini']}
        hasAnalystResult={false}
        onRunWorkflow={onRunWorkflow}
        onUseSeed={vi.fn()}
        onRunNextCompare={vi.fn()}
      />
    );

    expect(getByText('Ready to turn this compare into the next move')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Run analyst, then stage next step' }));
    expect(onRunWorkflow).toHaveBeenCalled();
  });

  it('renders a ready seed and distinguishes seed-only from real compare execution', () => {
    const onUseSeed = vi.fn();
    const onRunNextCompare = vi.fn();
    const { getByText, getByRole } = render(
      <WorkflowPanel
        turnId="turn-1"
        status="seed_ready"
        targetModels={['ChatGPT']}
        seedPrompt="Which trade-off matters most in production?"
        hasAnalystResult={true}
        onRunWorkflow={vi.fn()}
        onUseSeed={onUseSeed}
        onRunNextCompare={onRunNextCompare}
      />
    );

    expect(getByText('Next compare seed is ready')).toBeInTheDocument();
    expect(getByText('Which trade-off matters most in production?')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Seed composer only' }));
    expect(onUseSeed).toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Run next compare now' }));
    expect(onRunNextCompare).toHaveBeenCalled();
  });

  it('renders waiting and blocked states with honest copy', () => {
    const { getByText, rerender } = render(
      <WorkflowPanel
        turnId="turn-1"
        status="waiting_external"
        currentStepId="analyze"
        waitingFor="Waiting for browser-side analysis to finish."
        nextActionLabel="Analyze compare"
        nextActionSummary="Run AI Compare Analyst for turn turn-1."
        emittedActionCommand="analyze_compare"
        emittedActionStepId="analyze"
        targetModels={['ChatGPT']}
        hasAnalystResult={true}
        onRunWorkflow={vi.fn()}
        onUseSeed={vi.fn()}
        onRunNextCompare={vi.fn()}
      />
    );

    expect(getByText('Workflow is waiting on a browser-side step')).toBeInTheDocument();
    expect(getByText('Waiting for browser-side analysis to finish.')).toBeInTheDocument();
    expect(getByText('Current step: Analyze compare')).toBeInTheDocument();
    expect(getByText('Next external action')).toBeInTheDocument();
    expect(getByText('Run AI Compare Analyst for turn turn-1.')).toBeInTheDocument();

    rerender(
      <WorkflowPanel
        turnId="turn-1"
        status="blocked"
        targetModels={['ChatGPT']}
        errorMessage="Run AI Compare Analyst first so Prompt Switchboard can stage the next question."
        hasAnalystResult={false}
        onRunWorkflow={vi.fn()}
        onUseSeed={vi.fn()}
        onRunNextCompare={vi.fn()}
      />
    );

    expect(getByText('Workflow is blocked until this turn is ready')).toBeInTheDocument();
    expect(
      getByText('Run AI Compare Analyst first so Prompt Switchboard can stage the next question.')
    ).toBeInTheDocument();
  });
});
