import { describe, expect, it } from 'vitest';
import {
  LIVE_EXTENSION_STATES,
  LIVE_SITE_STATES,
  classifyLiveExtensionState,
  classifyLiveSiteState,
  describeLiveSiteResponsePathAdvisory,
  describeLiveSiteNextAction,
  hasLoginGatedSignal,
  toCanonicalReadinessStatus,
} from './liveSiteDiagnostics';

describe('liveSiteDiagnostics', () => {
  it('classifies a missing page as site_not_open', () => {
    expect(classifyLiveSiteState({ url: '' })).toBe(LIVE_SITE_STATES.SITE_NOT_OPEN);
  });

  it('classifies login-gated pages from button markers', () => {
    expect(
      classifyLiveSiteState({
        url: 'https://chatgpt.com/',
        loginButtons: ['登录', '免费注册'],
        bodyPreview: 'Welcome back',
        hasPromptSurface: true,
      })
    ).toBe(LIVE_SITE_STATES.SITE_LOGIN_GATED);
  });

  it('classifies compare-ready pages when prompt surface exists without login markers', () => {
    expect(
      classifyLiveSiteState({
        url: 'https://chatgpt.com/',
        loginButtons: [],
        bodyPreview: 'Project notes and current chat context',
        hasPromptSurface: true,
      })
    ).toBe(LIVE_SITE_STATES.SITE_READY_FOR_COMPARE);
  });

  it('classifies ambiguous public pages without prompt surface', () => {
    expect(
      classifyLiveSiteState({
        url: 'https://chatgpt.com/',
        loginButtons: [],
        bodyPreview: 'Explore plans and pricing',
        hasPromptSurface: false,
      })
    ).toBe(LIVE_SITE_STATES.SITE_PUBLIC_OR_AMBIGUOUS);
  });

  it('detects login-gated signal from body text even without buttons', () => {
    expect(
      hasLoginGatedSignal({
        url: 'https://chatgpt.com/',
        bodyPreview: '登录以获取基于已保存聊天的回答',
        loginButtons: [],
      })
    ).toBe(true);
  });

  it('classifies extension compare states', () => {
    expect(
      classifyLiveExtensionState({
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: true,
      })
    ).toBe(LIVE_EXTENSION_STATES.COMPARE_STARTED_BUT_NO_CARD);

    expect(
      classifyLiveExtensionState({
        hasCompareCard: true,
        hasCompletedCard: false,
        hasCheckingIndicator: true,
      })
    ).toBe(LIVE_EXTENSION_STATES.COMPARE_CARD_CREATED_BUT_NO_COMPLETION);

    expect(
      classifyLiveExtensionState({
        hasCompareCard: true,
        hasCompletedCard: true,
        hasCheckingIndicator: false,
      })
    ).toBe(LIVE_EXTENSION_STATES.COMPARE_COMPLETED);
  });

  it('describes next actions for live site states', () => {
    expect(describeLiveSiteNextAction('ChatGPT', LIVE_SITE_STATES.SITE_LOGIN_GATED)).toMatch(
      /Log in to ChatGPT/
    );
    expect(describeLiveSiteNextAction('Gemini', LIVE_SITE_STATES.SITE_NOT_OPEN)).toMatch(
      /Open Gemini/
    );
  });

  it('projects live site states onto the canonical readiness axis', () => {
    expect(toCanonicalReadinessStatus(LIVE_SITE_STATES.SITE_READY_FOR_COMPARE)).toBe('ready');
    expect(toCanonicalReadinessStatus(LIVE_SITE_STATES.SITE_NOT_OPEN)).toBe('tab_missing');
    expect(toCanonicalReadinessStatus(LIVE_SITE_STATES.SITE_LOGIN_GATED)).toBe(
      'selector_drift_suspect'
    );
    expect(toCanonicalReadinessStatus(LIVE_SITE_STATES.SITE_PUBLIC_OR_AMBIGUOUS)).toBe(
      'selector_drift_suspect'
    );
  });

  it('keeps response-path warnings advisory-only when a prompt surface is present', () => {
    expect(
      describeLiveSiteResponsePathAdvisory('Perplexity', {
        hasPromptSurface: true,
        hasResponseSurface: false,
        hasStopControl: false,
      })
    ).toContain('response container is visible yet');
    expect(
      describeLiveSiteResponsePathAdvisory('Perplexity', {
        hasPromptSurface: true,
        hasResponseSurface: true,
        hasStopControl: false,
      })
    ).toBeNull();
  });
});
