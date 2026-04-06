import { describe, expect, it } from 'vitest';
import {
  formatFailureClass,
  formatReadinessStatus,
  formatRuntimeStage,
  formatSelectorSource,
  formatShortBoolean,
} from './runtimeLabels';

describe('runtimeLabels', () => {
  const t = (key: string, defaultValue: string) => `${key}:${defaultValue}`;

  it('formats readiness states with translation keys', () => {
    expect(formatReadinessStatus('ready', t)).toBe('readiness.ready:Ready');
    expect(formatReadinessStatus('tab_missing', t)).toBe('readiness.tabMissing:Tab missing');
    expect(formatReadinessStatus('tab_loading', t)).toBe('readiness.tabLoading:Loading');
    expect(formatReadinessStatus('model_mismatch', t)).toBe(
      'readiness.modelMismatch:Wrong page'
    );
    expect(formatReadinessStatus('selector_drift_suspect', t)).toBe(
      'readiness.selectorDrift:Selector drift'
    );
    expect(formatReadinessStatus('content_unavailable', t)).toBe(
      'readiness.contentUnavailable:Content unavailable'
    );
    expect(formatReadinessStatus(undefined, t)).toBe('readiness.checking:Checking');
  });

  it('formats failure classes and falls back to the raw code for unknown values', () => {
    expect(formatFailureClass('handshake_mismatch', t)).toBe(
      'compare.diagnostics.failure.handshakeMismatch:Handshake mismatch'
    );
    expect(formatFailureClass('selector_drift_suspect', t)).toBe(
      'compare.diagnostics.failure.selectorDrift:Selector drift suspected'
    );
    expect(formatFailureClass('transient_delivery_or_runtime', t)).toBe(
      'compare.diagnostics.failure.transientRuntime:Transient delivery/runtime issue'
    );
    expect(formatFailureClass('tab_unavailable', t)).toBe(
      'compare.diagnostics.failure.tabUnavailable:Tab unavailable'
    );
    expect(formatFailureClass(undefined, t)).toBe('');
  });

  it('formats selector sources, runtime stages, and short booleans', () => {
    expect(formatSelectorSource('cached', t)).toBe(
      'compare.diagnostics.selector.cached:Remote selector cache'
    );
    expect(formatSelectorSource('default', t)).toBe(
      'compare.diagnostics.selector.default:Built-in selectors'
    );
    expect(formatSelectorSource(undefined, t)).toBe('');

    expect(formatRuntimeStage('content_ready_handshake', t)).toBe(
      'compare.diagnostics.stageValue.handshake:Handshake'
    );
    expect(formatRuntimeStage('content_execute_prompt', t)).toBe(
      'compare.diagnostics.stageValue.execution:Prompt run'
    );
    expect(formatRuntimeStage('delivery', t)).toBe(
      'compare.diagnostics.stageValue.delivery:Delivery'
    );
    expect(formatRuntimeStage(undefined, t)).toBe('');

    expect(formatShortBoolean(true, t)).toBe('compare.diagnostics.short.ready:ready');
    expect(formatShortBoolean(false, t)).toBe('compare.diagnostics.short.missing:missing');
  });
});
