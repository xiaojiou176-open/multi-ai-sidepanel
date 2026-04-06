import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CompareView } from './CompareView';
import { DELIVERY_STATUS, MESSAGE_ROLES, type Message } from '../../utils/types';
import { useStore } from '../store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('./CompareAnalystPanel', () => ({
  CompareAnalystPanel: () => <div data-testid="compare-analyst-panel" />,
}));

describe('CompareView', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    window.open = vi.fn();
    useStore.setState({
      retryTurnForModels: vi.fn(),
      setInput: vi.fn(),
      setSelectedModelsForCurrentSession: vi.fn(),
      refreshModelReadiness: vi.fn().mockResolvedValue([]),
      selectedModels: ['ChatGPT'],
      modelReadiness: {},
    } as Partial<ReturnType<typeof useStore.getState>>);
  });

  it('renders empty state, prompt packs, and onboarding actions when no compare turns exist', () => {
    const { getByTestId, getByText, getByRole } = render(<CompareView messages={[]} />);

    expect(getByTestId('compare-empty-state')).toBeInTheDocument();
    expect(getByText('First compare checklist')).toBeInTheDocument();
    expect(getByText('Prompt packs')).toBeInTheDocument();
    expect(getByText('Setup help when you need it')).toBeInTheDocument();
    expect(getByText('FAQ')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Install guide' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'First compare guide' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Supported sites' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'MCP starter kits' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Public distribution matrix' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'MCP agents guide' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Trust boundary' })).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Check readiness' }));
    expect(useStore.getState().refreshModelReadiness).toHaveBeenCalledWith(['ChatGPT']);

    fireEvent.click(getByRole('button', { name: 'MCP starter kits' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://xiaojiou176-open.github.io/multi-ai-sidepanel/mcp-starter-kits.html',
      '_blank',
      'noopener,noreferrer'
    );

    fireEvent.click(getByRole('button', { name: 'Public distribution matrix' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://xiaojiou176-open.github.io/multi-ai-sidepanel/public-distribution-matrix.html',
      '_blank',
      'noopener,noreferrer'
    );

    fireEvent.click(getByRole('button', { name: /Writing Pack/ }));
    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'ChatGPT',
      'Gemini',
      'Perplexity',
    ]);
    expect(useStore.getState().setInput).toHaveBeenCalledWith(
      'Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.'
    );
  });

  it('shows repair guidance inside onboarding when the selected model is blocked', () => {
    useStore.setState({
      refreshModelReadiness: vi.fn().mockResolvedValue([]),
      selectedModels: ['ChatGPT'],
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: false,
          status: 'selector_drift_suspect',
          remoteConfigConfigured: false,
          lastCheckedAt: 1,
        },
      },
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getByText, getByRole, getAllByRole } = render(<CompareView messages={[]} />);

    expect(getByText('Blocked? Start here')).toBeInTheDocument();
    expect(
      getByText(
        'Use the first compare guide, supported sites page, FAQ, or trust boundary to recover the blocked model before you run readiness again.'
      )
    ).toBeInTheDocument();
    expect(getByText('ChatGPT')).toBeInTheDocument();
    expect(getByText(/Prompt Switchboard has not confirmed a usable host/)).toBeInTheDocument();
    expect(getByRole('button', { name: 'Open this model' })).toBeInTheDocument();

    fireEvent.click(getAllByRole('button', { name: 'First compare guide' })[0]!);
    expect(window.open).toHaveBeenCalledWith(
      'https://xiaojiou176-open.github.io/multi-ai-sidepanel/first-compare-guide.html',
      '_blank',
      'noopener,noreferrer'
    );

    fireEvent.click(getByRole('button', { name: 'Open this model' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://chatgpt.com/',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('renders compare cards with statuses and actions', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'How would you solve this?',
        timestamp: 1,
        turnId: 'turn-1',
        requestId: 'req-1',
        requestedModels: ['ChatGPT', 'Gemini'],
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'ChatGPT says hello',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 2,
      },
      {
        id: 'assistant-2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Gemini failed',
        model: 'Gemini',
        timestamp: 3,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.ERROR,
        completedAt: 3,
        data: {
          stage: 'content_ready_handshake',
          selectorSource: 'default',
          hostname: 'gemini.google.com',
          remoteConfigConfigured: false,
        },
      },
    ];

    const { getByTestId, getAllByLabelText, getAllByText, getByText } = render(
      <CompareView messages={messages} />
    );

    expect(getByTestId('compare-view')).toBeInTheDocument();
    expect(getByTestId('compare-analyst-panel')).toBeInTheDocument();
    expect(getByTestId('compare-card-0-ChatGPT')).toBeInTheDocument();
    expect(getByTestId('compare-card-0-Gemini')).toBeInTheDocument();
    expect(getAllByText('ChatGPT says hello')[0]).toBeInTheDocument();
    expect(getAllByText('Gemini failed')[0]).toBeInTheDocument();
    expect(getAllByText('Run timeline').length).toBe(2);
    expect(getAllByText('Diagnostics details').length).toBeGreaterThan(0);
    fireEvent.click(getAllByText('Diagnostics details')[0]!);
    expect(getAllByText('handshake').length).toBeGreaterThan(0);

    fireEvent.click(getAllByLabelText('Copy response')[0]!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ChatGPT says hello');

    fireEvent.click(getAllByLabelText('Open model site')[0]!);
    expect(window.open).toHaveBeenCalled();

    fireEvent.click(getByText('Copy compare summary'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Prompt Switchboard compare summary')
    );

    fireEvent.click(getByText('Copy Markdown'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('# Prompt Switchboard compare export')
    );
  });

  it('renders legacy compare turns and falls back to execCommand copy', () => {
    const execCommand = vi.fn();
    vi.stubGlobal('navigator', {});
    document.execCommand = execCommand;

    const messages: Message[] = [
      {
        id: 'assistant-only',
        role: MESSAGE_ROLES.ASSISTANT,
        text: '',
        model: 'Perplexity',
        timestamp: 1,
        deliveryStatus: DELIVERY_STATUS.ERROR,
      },
      {
        id: 'streaming',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Still working',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-2',
        deliveryStatus: DELIVERY_STATUS.STREAMING,
        isStreaming: true,
      },
    ];

    const { getAllByText, getAllByLabelText } = render(<CompareView messages={messages} />);

    expect(getAllByText('Legacy prompt')).toHaveLength(2);
    expect(getAllByText('Failed').length).toBeGreaterThan(0);
    expect(getAllByText('Streaming').length).toBeGreaterThan(0);

    fireEvent.click(getAllByLabelText('Copy response')[0]!);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to response-derived models and pending copy text when requestedModels are absent', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'Fallback compare',
        timestamp: 1,
        turnId: 'turn-1',
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: '',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-1',
        deliveryStatus: DELIVERY_STATUS.PENDING,
      },
    ];

    const { getByText, getByTestId } = render(<CompareView messages={messages} />);

    expect(getByTestId('compare-card-0-ChatGPT')).toBeInTheDocument();
    expect(getByText('Waiting for the model to respond...')).toBeInTheDocument();
    expect(getByText('Pending')).toBeInTheDocument();
  });

  it('renders execution, delivery, and custom diagnostic stages for failed turns', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'Show me diagnostics',
        timestamp: 1,
        turnId: 'turn-1',
        requestId: 'req-1',
        requestedModels: ['ChatGPT', 'Gemini', 'Perplexity'],
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Execution failed',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.ERROR,
        data: {
          stage: 'content_execute_prompt',
          remoteConfigConfigured: true,
        },
      },
      {
        id: 'assistant-2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Delivery failed',
        model: 'Gemini',
        timestamp: 3,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.ERROR,
        data: {
          stage: 'delivery',
          hostname: 'gemini.google.com',
        },
      },
      {
        id: 'assistant-3',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Custom failed',
        model: 'Perplexity',
        timestamp: 4,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.ERROR,
        data: {
          stage: 'custom-stage',
        },
      },
    ];

    const { getAllByText } = render(<CompareView messages={messages} />);

    expect(
      getAllByText('The tab was ready, but the prompt run failed before a final answer could be captured.')
        .length
    ).toBeGreaterThan(0);
    expect(
      getAllByText('The model started, but Prompt Switchboard could not complete delivery back into the compare board.')
        .length
    ).toBeGreaterThan(0);
    expect(
      getAllByText('This run failed after the initial handoff, so Prompt Switchboard could not finish the answer lifecycle.')
        .length
    ).toBeGreaterThan(0);

    const diagnosticSummaries = getAllByText('Diagnostics details');
    diagnosticSummaries.forEach((summary) => fireEvent.click(summary));

    expect(getAllByText('execution').length).toBeGreaterThan(0);
    expect(getAllByText('delivery').length).toBeGreaterThan(0);
    expect(getAllByText('custom-stage').length).toBeGreaterThan(0);
  });

  it('renders deeper readiness diagnostics and can continue from a successful answer', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'Need diagnostics',
        timestamp: 1,
        turnId: 'turn-1',
        requestId: 'req-1',
        requestedModels: ['ChatGPT'],
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Working answer',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 2,
        data: {
          readinessStatus: 'ready',
          failureClass: 'transient_delivery_or_runtime',
          selectorSource: 'cached',
          hostname: 'chatgpt.com',
          remoteConfigConfigured: true,
          inputReady: true,
          submitReady: false,
        },
      },
    ];

    const { getByText, getByLabelText, getAllByText } = render(<CompareView messages={messages} />);

    expect(getByText('Readiness')).toBeInTheDocument();
    expect(getAllByText('ready').length).toBeGreaterThan(0);
    expect(getByText('Failure class')).toBeInTheDocument();
    expect(getByText('Transient delivery/runtime issue')).toBeInTheDocument();
    expect(getByText('Input')).toBeInTheDocument();
    expect(getByText('Submit')).toBeInTheDocument();

    fireEvent.click(getByLabelText('Use response as next-round seed'));
    expect(useStore.getState().setInput).toHaveBeenCalledWith('Working answer');
  });

  it('retries failed models and prepares a judge prompt', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'Which answer is strongest?',
        timestamp: 1,
        turnId: 'turn-1',
        requestId: 'req-1',
        requestedModels: ['ChatGPT', 'Perplexity', 'Gemini'],
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'ChatGPT answer',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 2,
      },
      {
        id: 'assistant-3',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Perplexity answer',
        model: 'Perplexity',
        timestamp: 2,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 2,
      },
      {
        id: 'assistant-2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Gemini failed',
        model: 'Gemini',
        timestamp: 3,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.ERROR,
      },
    ];

    const { getAllByRole, getByLabelText, getByText, getAllByText } = render(
      <CompareView messages={messages} />
    );

    expect(getAllByRole('button', { name: 'Retry failed only' })[0]).toBeInTheDocument();
    expect(getAllByRole('button', { name: 'Draft seed from this turn' }).length).toBeGreaterThan(0);
    expect(getAllByText('Quick seed lane').length).toBeGreaterThan(0);
    expect(
      getByText('Some models failed while others completed, so this compare turn is split.')
    ).toBeInTheDocument();
    expect(getByText('Failed: Gemini')).toBeInTheDocument();
    expect(
      getByText('Retry the failed models first, then compare the refreshed turn.')
    ).toBeInTheDocument();
    expect(getByText('Manual seed from Perplexity')).toBeInTheDocument();

    fireEvent.click(getAllByRole('button', { name: 'Retry failed only' })[0]!);
    expect(useStore.getState().retryTurnForModels).toHaveBeenCalledWith('turn-1', ['Gemini']);

    fireEvent.click(getByLabelText('Retry this model'));
    expect(useStore.getState().retryTurnForModels).toHaveBeenCalledWith('turn-1', ['Gemini']);

    fireEvent.click(getAllByRole('button', { name: 'Draft seed from this turn' })[0]!);
    expect(useStore.getState().setInput).toHaveBeenCalled();
    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'ChatGPT',
      'Perplexity',
    ]);

    fireEvent.click(getByText('Manual seed from Perplexity'));
    expect(useStore.getState().setInput).toHaveBeenCalledWith('Perplexity answer');
    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'Perplexity',
    ]);
  });

  it('renders a judge recommendation when completed answers diverge without failures', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'Compare these two long-form answers.',
        timestamp: 1,
        turnId: 'turn-judge',
        requestId: 'req-judge',
        requestedModels: ['ChatGPT', 'Gemini'],
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Short answer',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-judge',
        requestId: 'req-judge',
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 10,
      },
      {
        id: 'assistant-2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'x'.repeat(150),
        model: 'Gemini',
        timestamp: 3,
        turnId: 'turn-judge',
        requestId: 'req-judge',
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 12,
      },
    ];

    const { getAllByText } = render(<CompareView messages={messages} />);

    expect(getAllByText('Quick seed lane').length).toBeGreaterThan(0);
    expect(
      getAllByText('Completed answers diverged enough to justify a focused follow-up review round.')
        .length
    ).toBeGreaterThan(0);
    expect(getAllByText(/follow-up review prompt|next compare seed/i).length).toBeGreaterThan(0);
    expect(getAllByText('Manual seed from Gemini').length).toBeGreaterThan(0);
  });
});
