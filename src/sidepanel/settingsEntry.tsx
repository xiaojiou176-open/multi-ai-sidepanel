// CRITICAL: Initialize mock Chrome API FIRST, before any other imports
import { initMockChrome } from '../services/mockChrome';

const hasRealExtensionChrome =
  typeof window !== 'undefined' &&
  typeof chrome !== 'undefined' &&
  typeof chrome.runtime?.getURL === 'function' &&
  typeof chrome.storage?.local !== 'undefined';

if (!hasRealExtensionChrome) {
  initMockChrome();
}

import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import i18n from '../i18n';
import { SettingsPanel } from './components/SettingsPanel';
import { Logger, toErrorMessage } from '../utils/logger';

class SettingsErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    Logger.error('settings_entry_error_boundary', {
      surface: 'sidepanel',
      code: 'settings_entry_error_boundary',
      error: toErrorMessage(error),
      componentStack: info?.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm text-red-600">
          {i18n.t('settingsEntry.crash', 'Settings crashed.')}
        </div>
      );
    }
    return this.props.children;
  }
}

export const SettingsApp = () => (
  <div className="h-screen bg-white">
    <SettingsErrorBoundary>
      <SettingsPanel onClose={() => undefined} />
    </SettingsErrorBoundary>
  </div>
);

createRoot(document.getElementById('root')!).render(<SettingsApp />);
