import type { ModelName } from '../utils/types';
import { StorageService } from '../services/storage';
import { getModelConfig, isModelHostname } from '../utils/modelConfig';
import { Logger, toErrorMessage } from '../utils/logger';

class TabManager {
  // ==================== Tab Cache ====================
  private tabs: Map<ModelName, number> = new Map();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.loadTabs();
  }

  private async loadTabs(): Promise<void> {
    try {
      const stored = await StorageService.getTabs();
      Object.entries(stored).forEach(([model, tabId]) => {
        this.tabs.set(model as ModelName, tabId);
      });
    } catch (error) {
      Logger.error('tab_manager_load_failed', {
        surface: 'background',
        code: 'tab_manager_load_failed',
        error: toErrorMessage(error),
      });
    }
  }

  private async persistTabs(): Promise<void> {
    const payload: Record<string, number> = {};
    this.tabs.forEach((tabId, model) => {
      payload[model] = tabId;
    });
    await StorageService.saveTabs(payload);
  }

  private doesTabMatchModel(
    tab: {
      id?: number;
      url?: string;
    } | null | undefined,
    model: ModelName
  ) {
    if (!tab?.id || !tab.url) {
      return false;
    }

    try {
      return isModelHostname(new URL(tab.url).hostname, model);
    } catch {
      return false;
    }
  }

  private scoreCandidateTab(
    tab: {
      active?: boolean;
      highlighted?: boolean;
      pinned?: boolean;
      lastAccessed?: number;
      index?: number;
    } | null | undefined
  ) {
    if (!tab) {
      return Number.NEGATIVE_INFINITY;
    }

    return (
      (tab.active ? 100 : 0) +
      (tab.highlighted ? 20 : 0) +
      (tab.pinned ? 5 : 0) +
      (typeof tab.lastAccessed === 'number' ? tab.lastAccessed / 1_000_000 : 0) -
      (typeof tab.index === 'number' ? tab.index : 0)
    );
  }

  private async findMatchingTabs(model: ModelName) {
    const tabs =
      typeof chrome.tabs.query === 'function'
        ? (await chrome.tabs.query({}).catch(() => [])) ?? []
        : [];

    return tabs
      .filter((tab) => this.doesTabMatchModel(tab, model))
      .sort((left, right) => this.scoreCandidateTab(right) - this.scoreCandidateTab(left));
  }

  async getTabId(model: ModelName): Promise<number> {
    await this.ready;

    const existingTabId = await this.getExistingTabId(model);

    if (existingTabId) {
      return existingTabId;
    }

    // Create new tab
    const tab = await chrome.tabs.create({
      url: getModelConfig(model).openUrl,
      active: false, // Ghost mode
    });

    if (tab.id) {
      this.tabs.set(model, tab.id);
      await this.persistTabs();
      return tab.id;
    }

    throw new Error(`Failed to create tab for ${model}`);
  }

  async getExistingTabId(model: ModelName): Promise<number | null> {
    await this.ready;

    const existingTabId = this.tabs.get(model);

    if (existingTabId) {
      try {
        const tab = await chrome.tabs.get(existingTabId);
        if (this.doesTabMatchModel(tab, model)) {
          return existingTabId;
        }
        this.tabs.delete(model);
        await this.persistTabs();
      } catch {
        // Ignore errors if tab doesn't exist
        this.tabs.delete(model);
        await this.persistTabs();
      }
    }

    const matchingTab = (await this.findMatchingTabs(model))[0];

    if (matchingTab?.id) {
      this.tabs.set(model, matchingTab.id);
      await this.persistTabs();
      return matchingTab.id;
    }

    return null;
  }

  async getCandidateTabIds(model: ModelName): Promise<number[]> {
    await this.ready;

    const existingTabId = await this.getExistingTabId(model);
    const matchingTabs = await this.findMatchingTabs(model);
    const candidateIds = matchingTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number');

    if (!existingTabId) {
      return candidateIds;
    }

    return [existingTabId, ...candidateIds.filter((tabId) => tabId !== existingTabId)];
  }

  async rememberTabId(model: ModelName, tabId: number): Promise<void> {
    await this.ready;
    this.tabs.set(model, tabId);
    await this.persistTabs();
  }

  async ensureTabReady(tabId: number, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      let listener: ((id: number, changeInfo: { status?: string }) => void) | null = null;

      const finalize = () => {
        if (settled) return;
        settled = true;
        if (listener) {
          chrome.tabs.onUpdated.removeListener(listener);
        }
        clearTimeout(timeoutId);
        resolve();
      };

      const timeoutId = setTimeout(() => {
        Logger.warn('tab_manager_ready_timeout', {
          surface: 'background',
          code: 'tab_manager_ready_timeout',
          tabId,
          timeoutMs,
        });
        finalize();
      }, timeoutMs);

      try {
        chrome.tabs.get(tabId, (tab) => {
          if (!tab) {
            Logger.warn('tab_manager_tab_missing', {
              surface: 'background',
              code: 'tab_manager_tab_missing',
              tabId,
            });
            finalize();
            return;
          }

          if (tab.url?.startsWith('chrome://')) {
            finalize();
            return;
          }

          if (tab.status === 'complete') {
            finalize();
            return;
          }

          listener = (id: number, changeInfo: { status?: string }) => {
            if (id === tabId && changeInfo.status === 'complete') {
              finalize();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      } catch (error) {
        Logger.error('tab_manager_ready_check_failed', {
          surface: 'background',
          code: 'tab_manager_ready_check_failed',
          tabId,
          error: toErrorMessage(error),
        });
        finalize();
      }
    });
  }
}

export const tabManager = new TabManager();
