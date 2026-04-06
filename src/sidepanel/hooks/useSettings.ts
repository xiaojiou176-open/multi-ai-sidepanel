import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, StorageService, type Settings } from '../../services/storage';
import { Logger, toErrorMessage } from '../../utils/logger';

// ==================== Settings Hook ====================

export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let isMounted = true;
    const canReadChromeSettings =
      typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);

    const loadSettings = async () => {
      try {
        const saved = await StorageService.getSettings();
        if (isMounted) setSettings({ ...DEFAULT_SETTINGS, ...saved });
      } catch (error) {
        Logger.error('sidepanel_settings_load_failed', {
          surface: 'sidepanel',
          code: 'sidepanel_settings_load_failed',
          error: toErrorMessage(error),
        });
        if (isMounted) setSettings(DEFAULT_SETTINGS);
      }
    };

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes.settings?.newValue) {
        setSettings({ ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Settings) });
      }
    };

    if (canReadChromeSettings) {
      void loadSettings();
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    return () => {
      isMounted = false;
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, []);

  return settings;
}
