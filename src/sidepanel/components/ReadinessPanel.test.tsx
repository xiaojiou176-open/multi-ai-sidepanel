import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadinessPanel } from './ReadinessPanel';
import { useStore } from '../store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe('ReadinessPanel', () => {
  it('renders readiness pills and refreshes model health', () => {
    window.open = vi.fn();
    useStore.setState({
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: true,
          status: 'ready',
          remoteConfigConfigured: false,
          lastCheckedAt: 1,
        },
        Gemini: {
          model: 'Gemini',
          ready: false,
          status: 'selector_drift_suspect',
          remoteConfigConfigured: true,
          failureClass: 'selector_drift_suspect',
          selectorSource: 'cached',
          lastCheckedAt: 2,
        },
      },
      refreshModelReadiness: vi.fn().mockResolvedValue([]),
      isCheckingReadiness: false,
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getByTestId, getByRole, getByText, getAllByText } = render(
      <ReadinessPanel models={['ChatGPT', 'Gemini']} />
    );

    expect(getByTestId('readiness-pill-ChatGPT')).toBeInTheDocument();
    expect(getByTestId('readiness-pill-Gemini')).toBeInTheDocument();
    expect(getAllByText('Ready').length).toBeGreaterThan(0);
    expect(getAllByText('Selector drift').length).toBeGreaterThan(0);
    expect(getByRole('button', { name: 'Review repair steps' })).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Review repair steps' }));
    expect(
      getByText(/Prompt Switchboard found the page, but could not confirm the send controls/)
    ).toBeInTheDocument();
    expect(getByText(/Remote selector cache/)).toBeInTheDocument();
    expect(getByTestId('readiness-repair-Gemini')).toBeInTheDocument();
    expect(getByRole('button', { name: 'First compare guide' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Supported sites' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'FAQ' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Trust boundary' })).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Refresh' }));
    expect(useStore.getState().refreshModelReadiness).toHaveBeenCalledWith([
      'ChatGPT',
      'Gemini',
    ]);
  });

  it('shows the ok summary when everything is ready or still checking', () => {
    useStore.setState({
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: true,
          status: 'ready',
          remoteConfigConfigured: false,
          lastCheckedAt: 1,
        },
        Gemini: {
          model: 'Gemini',
          ready: false,
          status: 'tab_loading',
          remoteConfigConfigured: false,
          lastCheckedAt: 2,
        },
      },
      refreshModelReadiness: vi.fn().mockResolvedValue([]),
      isCheckingReadiness: true,
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getAllByText, getByRole } = render(
      <ReadinessPanel models={['ChatGPT', 'Gemini']} />
    );

    expect(
      getAllByText('Selected models look ready, or Prompt Switchboard is checking them now.')[0]
    ).toBeInTheDocument();
    expect(getAllByText('Loading').length).toBeGreaterThan(0);
    expect(getByRole('button', { name: 'Review repair steps' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });

  it('renders the remaining readiness labels', () => {
    window.open = vi.fn();
    useStore.setState({
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: false,
          status: 'tab_missing',
          remoteConfigConfigured: false,
          lastCheckedAt: 1,
        },
        Gemini: {
          model: 'Gemini',
          ready: false,
          status: 'model_mismatch',
          remoteConfigConfigured: false,
          lastCheckedAt: 2,
        },
        Grok: {
          model: 'Grok',
          ready: false,
          status: 'content_unavailable',
          remoteConfigConfigured: false,
          lastCheckedAt: 3,
        },
      },
      refreshModelReadiness: vi.fn().mockResolvedValue([]),
      isCheckingReadiness: false,
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getAllByText, getAllByRole } = render(
      <ReadinessPanel models={['ChatGPT', 'Gemini', 'Grok']} />
    );

    expect(getAllByText('Tab missing').length).toBeGreaterThan(0);
    expect(getAllByText('Wrong page').length).toBeGreaterThan(0);
    expect(getAllByText('Content unavailable').length).toBeGreaterThan(0);

    fireEvent.click(getAllByRole('button', { name: 'Review repair steps' })[0]!);
    fireEvent.click(getAllByRole('button', { name: 'Open model tab' })[0]!);
    expect(window.open).toHaveBeenCalled();
  });

  it('can jump from the repair center to model health', () => {
    window.open = vi.fn();
    const onOpenSettings = vi.fn();
    useStore.setState({
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: false,
          status: 'content_unavailable',
          remoteConfigConfigured: false,
          lastCheckedAt: 1,
        },
      },
      refreshModelReadiness: vi.fn().mockResolvedValue([]),
      isCheckingReadiness: false,
    } as Partial<ReturnType<typeof useStore.getState>>);

    const { getByRole } = render(
      <ReadinessPanel models={['ChatGPT']} onOpenSettings={onOpenSettings} />
    );

    fireEvent.click(getByRole('button', { name: 'Review repair steps' }));
    fireEvent.click(getByRole('button', { name: 'Open model health' }));
    expect(onOpenSettings).toHaveBeenCalled();

    fireEvent.click(getByRole('button', { name: 'Supported sites' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://xiaojiou176-open.github.io/multi-ai-sidepanel/supported-sites.html',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
