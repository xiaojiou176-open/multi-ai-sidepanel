import i18n from 'i18next';
import * as ReactI18next from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';
import { StorageService } from '../services/storage';
import { Logger, toErrorMessage } from '../utils/logger';

// Initialize with default, then load from storage
const initReactPlugin =
  'initReactI18next' in ReactI18next ? ReactI18next.initReactI18next : undefined;

const i18nInstance = initReactPlugin ? i18n.use(initReactPlugin) : i18n;

i18nInstance.init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: 'en', // Default startup language for first-run contributor experience
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

// Async load language from storage (only if chrome is available)
if (typeof chrome !== 'undefined' && chrome.storage && typeof window !== 'undefined') {
  const isExtensionUiPage =
    window.location.protocol === 'chrome-extension:' &&
    (window.location.pathname.includes('index.html') ||
      window.location.pathname.includes('settings.html'));

  const isSettingsPage = window.location.pathname.includes('settings.html');

  if (isExtensionUiPage && !isSettingsPage && typeof StorageService.getSettings === 'function') {
    StorageService.getSettings()
      .then((settings) => {
        if (settings.language) {
          i18n.changeLanguage(settings.language);
        }
      })
      .catch((error) => {
        Logger.warn('i18n_language_settings_load_failed', {
          surface: 'sidepanel',
          code: 'i18n_language_settings_load_failed',
          error: toErrorMessage(error),
        });
      });
  }
}

export default i18n;
