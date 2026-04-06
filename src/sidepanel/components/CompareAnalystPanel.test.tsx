import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompareAnalystPanel } from './CompareAnalystPanel';
import { useStore } from '../store';
import { ANALYSIS_STATUSES, ANALYSIS_PROVIDER_IDS } from '../../services/analysis';
import type { Settings } from '../../services/storage';
import { SETTINGS_OPEN_EVENT } from '../utils/shouldOpenSettingsFromUrl';
import { DELIVERY_STATUS, MESSAGE_ROLES, type Message } from '../../utils/types';

const settingsState: Pick<Settings, 'analysis'> = {
  analysis: {
    enabled: true,
    provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION as Settings['analysis']['provider'],
    model: 'ChatGPT',
  },
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => settingsState,
}));

describe('CompareAnalystPanel', () => {
  const completedResponse: Message = {
    id: 'assistant-1',
    role: MESSAGE_ROLES.ASSISTANT,
    text: 'Completed answer',
    model: 'ChatGPT',
    timestamp: 2,
    deliveryStatus: DELIVERY_STATUS.COMPLETE,
    completedAt: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    useStore.setState({
      analysisByTurn: {},
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: true,
          status: 'ready',
          remoteConfigConfigured: false,
          lastCheckedAt: Date.now(),
        },
      },
      runCompareAnalysis: vi.fn(),
      refreshModelReadiness: vi.fn().mockResolvedValue([]),
      setInput: vi.fn(),
      setSelectedModelsForCurrentSession: vi.fn(),
    } as Partial<ReturnType<typeof useStore.getState>>);
    settingsState.analysis.enabled = true;
    settingsState.analysis.provider = ANALYSIS_PROVIDER_IDS.BROWSER_SESSION;
    settingsState.analysis.model = 'ChatGPT';
  });

  it('shows the empty state when fewer than two completed answers are available', () => {
    const { getByText } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT']}
        responses={{ ChatGPT: completedResponse }}
        followUpModels={['ChatGPT']}
      />
    );

    expect(
      getByText('Wait until at least two model answers are complete before running AI Compare Analyst.')
    ).toBeInTheDocument();
  });

  it('shows the local runtime lane copy when the Switchyard provider is selected', () => {
    settingsState.analysis.provider = ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME;

    const { getByText, getByRole } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT', 'Gemini']}
        responses={{ ChatGPT: completedResponse, Gemini: { ...completedResponse, id: '2', model: 'Gemini' } }}
        followUpModels={['ChatGPT']}
      />
    );

    expect(
      getByText((_content, node) => node?.textContent === 'Lane: Local Switchyard runtime')
    ).toBeInTheDocument();
    expect(
      getByText(
        'Core compare stays browser-native. This optional lane sends one analysis prompt through a local Switchyard runtime while Prompt Switchboard keeps the cockpit, tabs, and compare workflow.'
      )
    ).toBeInTheDocument();
    expect(getByRole('button', { name: 'Analyze compare' })).toBeInTheDocument();
  });

  it('triggers the store action when the browser-session analyst is ready', () => {
    const runCompareAnalysis = vi.fn();
    useStore.setState({ runCompareAnalysis } as Partial<ReturnType<typeof useStore.getState>>);

    const { getByRole } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT', 'Gemini']}
        responses={{ ChatGPT: completedResponse, Gemini: { ...completedResponse, id: '2', model: 'Gemini' } }}
        followUpModels={['ChatGPT']}
      />
    );

    fireEvent.click(getByRole('button', { name: 'Analyze compare' }));
    expect(runCompareAnalysis).toHaveBeenCalledWith('turn-1');
  });

  it('renders a successful analysis and lets the user reuse the next question', () => {
    useStore.setState({
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.SUCCESS,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          updatedAt: 1,
          result: {
            provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
            model: 'ChatGPT',
            createdAt: 1,
            consensusSummary: 'The models broadly agree on the main direction.',
            disagreementSummary: 'One answer is more implementation-specific.',
            recommendedAnswerModel: 'Gemini',
            recommendationReason: 'Gemini offers the clearest production-ready trade-off summary.',
            nextQuestion: 'Which implementation trade-off matters most in production?',
            synthesisDraft: 'A balanced synthesis draft.',
          },
        },
      },
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getAllByText, getByRole } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT', 'Gemini']}
        responses={{ ChatGPT: completedResponse, Gemini: { ...completedResponse, id: '2', model: 'Gemini' } }}
        followUpModels={['ChatGPT']}
      />
    );

    expect(getAllByText('The models broadly agree on the main direction.').length).toBeGreaterThan(0);
    expect(
      getAllByText('Gemini offers the clearest production-ready trade-off summary.').length
    ).toBeGreaterThan(0);
    expect(getAllByText('Decision guidance').length).toBeGreaterThan(0);
    expect(getAllByText('Seed only').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: 'Seed next compare with suggested question' }));
    expect(useStore.getState().setInput).toHaveBeenCalledWith(
      'Which implementation trade-off matters most in production?'
    );
    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'ChatGPT',
    ]);

    fireEvent.click(getByRole('button', { name: 'Seed next compare from recommended answer' }));
    expect(useStore.getState().setInput).toHaveBeenCalledWith('Completed answer');
    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'Gemini',
    ]);
  });

  it('shows the running state while analysis is in flight', () => {
    useStore.setState({
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.RUNNING,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          updatedAt: 1,
        },
      },
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getAllByText, getByText, queryByRole } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT', 'Gemini']}
        responses={{ ChatGPT: completedResponse, Gemini: { ...completedResponse, id: '2', model: 'Gemini' } }}
        followUpModels={['ChatGPT']}
      />
    );

    expect(getByText('Analyzing this compare turn')).toBeInTheDocument();
    expect(getAllByText('Needs analyst run').length).toBeGreaterThan(0);
    expect(
      getByText('Summarizing consensus across the completed answers')
    ).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Analyze compare' })).not.toBeInTheDocument();
  });

  it('shows the error state and supports retry plus settings navigation', () => {
    const runCompareAnalysis = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    useStore.setState({
      runCompareAnalysis,
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.ERROR,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          updatedAt: 1,
          errorMessage: 'The tab rejected the analysis run.',
        },
      },
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getAllByText, getByRole, getByText } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT', 'Gemini']}
        responses={{ ChatGPT: completedResponse, Gemini: { ...completedResponse, id: '2', model: 'Gemini' } }}
        followUpModels={['ChatGPT']}
      />
    );

    expect(getByText('AI analysis did not finish')).toBeInTheDocument();
    expect(getAllByText('Needs analyst run').length).toBeGreaterThan(0);
    fireEvent.click(getByRole('button', { name: 'Try analysis again' }));
    expect(runCompareAnalysis).toHaveBeenCalledWith('turn-1');

    fireEvent.click(getByRole('button', { name: 'Open analysis settings' }));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: SETTINGS_OPEN_EVENT }));
  });

  it('shows the analyst-tab-not-ready state and lets the user refresh or open the tab', () => {
    const refreshModelReadiness = vi.fn().mockResolvedValue([]);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    useStore.setState({
      refreshModelReadiness,
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: false,
          status: 'selector_drift_suspect',
          remoteConfigConfigured: false,
          selectorSource: 'default',
          inputReady: true,
          submitReady: false,
          lastCheckedAt: 10,
        },
      },
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.BLOCKED,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          updatedAt: 1,
          blockReason: 'model_not_ready',
          errorMessage: 'ChatGPT is still not ready.',
        },
      },
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getAllByText, getByRole, getByText } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT', 'Gemini']}
        responses={{ ChatGPT: completedResponse, Gemini: { ...completedResponse, id: '2', model: 'Gemini' } }}
        followUpModels={['ChatGPT']}
      />
    );

    expect(getByText('The analyst tab is not ready yet')).toBeInTheDocument();
    expect(getAllByText('Needs analyst run').length).toBeGreaterThan(0);
    fireEvent.click(getByRole('button', { name: 'Open analyst tab' }));
    expect(openSpy).toHaveBeenCalled();

    fireEvent.click(getByRole('button', { name: 'Check analyst readiness' }));
    expect(refreshModelReadiness).toHaveBeenCalledWith(['ChatGPT']);
  });

  it('copies the analysis summary and supports reusing the synthesis draft', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });

    useStore.setState({
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.SUCCESS,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          updatedAt: 1,
          result: {
            provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
            model: 'ChatGPT',
            createdAt: 1,
            consensusSummary: 'Consensus block',
            disagreementSummary: 'Disagreement block',
            recommendedAnswerModel: null,
            recommendationReason: 'Need more evidence before picking one answer.',
            nextQuestion: 'What evidence would break the tie?',
            synthesisDraft: 'Merged synthesis draft',
          },
        },
      },
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getAllByText, getByRole, getByText } = render(
      <CompareAnalystPanel
        turnId="turn-1"
        requestedModels={['ChatGPT', 'Gemini']}
        responses={{ ChatGPT: completedResponse, Gemini: { ...completedResponse, id: '2', model: 'Gemini' } }}
        followUpModels={['ChatGPT', 'Gemini']}
      />
    );

    expect(getByText('No single answer is reliable enough to recommend yet.')).toBeInTheDocument();
    expect(getAllByText('Seed only').length).toBeGreaterThan(0);

    fireEvent.click(getByRole('button', { name: 'Copy decision guidance' }));
    expect(writeText).toHaveBeenCalledWith(
      ['Consensus block', 'Disagreement block', 'Need more evidence before picking one answer.', 'What evidence would break the tie?'].join('\n\n')
    );

    fireEvent.click(getByRole('button', { name: 'Seed next compare with synthesis draft' }));
    expect(useStore.getState().setInput).toHaveBeenCalledWith('Merged synthesis draft');
    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'ChatGPT',
      'Gemini',
    ]);
  });
});
