import type { FailureClass, ReadinessStatus, SelectorSource } from '../../utils/types';

type Translate = (key: string, defaultValue: string) => string;

const defaultT: Translate = (_key, defaultValue) => defaultValue;

export const formatReadinessStatus = (
  status: ReadinessStatus | undefined,
  t: Translate = defaultT
) => {
  switch (status) {
    case 'ready':
      return t('readiness.ready', 'Ready');
    case 'tab_missing':
      return t('readiness.tabMissing', 'Tab missing');
    case 'tab_loading':
      return t('readiness.tabLoading', 'Loading');
    case 'model_mismatch':
      return t('readiness.modelMismatch', 'Wrong page');
    case 'selector_drift_suspect':
      return t('readiness.selectorDrift', 'Selector drift');
    case 'content_unavailable':
      return t('readiness.contentUnavailable', 'Content unavailable');
    default:
      return t('readiness.checking', 'Checking');
  }
};

export const formatFailureClass = (
  failureClass: FailureClass | undefined,
  t: Translate = defaultT
) => {
  switch (failureClass) {
    case 'handshake_mismatch':
      return t('compare.diagnostics.failure.handshakeMismatch', 'Handshake mismatch');
    case 'selector_drift_suspect':
      return t('compare.diagnostics.failure.selectorDrift', 'Selector drift suspected');
    case 'transient_delivery_or_runtime':
      return t('compare.diagnostics.failure.transientRuntime', 'Transient delivery/runtime issue');
    case 'tab_unavailable':
      return t('compare.diagnostics.failure.tabUnavailable', 'Tab unavailable');
    default:
      return failureClass ?? '';
  }
};

export const formatSelectorSource = (
  selectorSource: SelectorSource | undefined,
  t: Translate = defaultT
) => {
  switch (selectorSource) {
    case 'cached':
      return t('compare.diagnostics.selector.cached', 'Remote selector cache');
    case 'default':
      return t('compare.diagnostics.selector.default', 'Built-in selectors');
    default:
      return selectorSource ?? '';
  }
};

export const formatRuntimeStage = (stage: string | undefined, t: Translate = defaultT) => {
  switch (stage) {
    case 'content_ready_handshake':
      return t('compare.diagnostics.stageValue.handshake', 'Handshake');
    case 'content_execute_prompt':
      return t('compare.diagnostics.stageValue.execution', 'Prompt run');
    case 'delivery':
      return t('compare.diagnostics.stageValue.delivery', 'Delivery');
    default:
      return stage ?? '';
  }
};

export const formatShortBoolean = (value: boolean, t: Translate = defaultT) =>
  value
    ? t('compare.diagnostics.short.ready', 'ready')
    : t('compare.diagnostics.short.missing', 'missing');
