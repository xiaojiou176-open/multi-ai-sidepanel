import { READINESS_STATUSES, type ModelName, type ReadinessStatus } from './types';

export const LIVE_SITE_STATES = {
  SITE_NOT_OPEN: 'site_not_open',
  SITE_LOGIN_GATED: 'site_login_gated',
  SITE_PUBLIC_OR_AMBIGUOUS: 'site_public_or_ambiguous',
  SITE_READY_FOR_COMPARE: 'site_ready_for_compare',
} as const;

export type LiveSiteState = (typeof LIVE_SITE_STATES)[keyof typeof LIVE_SITE_STATES];

export const LIVE_EXTENSION_STATES = {
  IDLE_OR_UNKNOWN: 'idle_or_unknown',
  COMPARE_STARTED_BUT_NO_CARD: 'compare_started_but_no_card',
  COMPARE_CARD_CREATED_BUT_NO_COMPLETION: 'compare_card_created_but_no_completion',
  COMPARE_COMPLETED: 'compare_completed',
} as const;

export type LiveExtensionState =
  (typeof LIVE_EXTENSION_STATES)[keyof typeof LIVE_EXTENSION_STATES];

export interface LiveSiteInspectionInput {
  url?: string;
  title?: string;
  bodyPreview?: string;
  loginButtons?: string[];
  hasPromptSurface?: boolean;
  hasResponseSurface?: boolean;
  hasStopControl?: boolean;
}

export interface LiveExtensionInspectionInput {
  hasCompareCard: boolean;
  hasCompletedCard: boolean;
  hasCheckingIndicator: boolean;
}

const LOGIN_GATED_TEXT_PATTERN =
  /(?:\b(?:log in|login|sign in|sign up)\b|登录|免费注册|注册|登录以获取|继续使用|continue with|get started)/i;

export const hasLoginGatedSignal = (input: LiveSiteInspectionInput): boolean => {
  const loginButtons = input.loginButtons ?? [];
  const bodyPreview = input.bodyPreview ?? '';

  return (
    loginButtons.some((label) => label.trim().length > 0) ||
    LOGIN_GATED_TEXT_PATTERN.test(bodyPreview)
  );
};

export const classifyLiveSiteState = (input: LiveSiteInspectionInput): LiveSiteState => {
  if (!input.url) {
    return LIVE_SITE_STATES.SITE_NOT_OPEN;
  }

  if (hasLoginGatedSignal(input)) {
    return LIVE_SITE_STATES.SITE_LOGIN_GATED;
  }

  if (input.hasPromptSurface) {
    return LIVE_SITE_STATES.SITE_READY_FOR_COMPARE;
  }

  return LIVE_SITE_STATES.SITE_PUBLIC_OR_AMBIGUOUS;
};

export const toCanonicalReadinessStatus = (state: LiveSiteState): ReadinessStatus => {
  switch (state) {
    case LIVE_SITE_STATES.SITE_READY_FOR_COMPARE:
      return READINESS_STATUSES.READY;
    case LIVE_SITE_STATES.SITE_NOT_OPEN:
      return READINESS_STATUSES.TAB_MISSING;
    case LIVE_SITE_STATES.SITE_LOGIN_GATED:
    case LIVE_SITE_STATES.SITE_PUBLIC_OR_AMBIGUOUS:
    default:
      return READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT;
  }
};

export const classifyLiveExtensionState = (
  input: LiveExtensionInspectionInput
): LiveExtensionState => {
  if (input.hasCompletedCard) {
    return LIVE_EXTENSION_STATES.COMPARE_COMPLETED;
  }

  if (input.hasCompareCard) {
    return LIVE_EXTENSION_STATES.COMPARE_CARD_CREATED_BUT_NO_COMPLETION;
  }

  if (input.hasCheckingIndicator) {
    return LIVE_EXTENSION_STATES.COMPARE_STARTED_BUT_NO_CARD;
  }

  return LIVE_EXTENSION_STATES.IDLE_OR_UNKNOWN;
};

export const describeLiveSiteNextAction = (model: ModelName, state: LiveSiteState): string => {
  switch (state) {
    case LIVE_SITE_STATES.SITE_NOT_OPEN:
      return `Open ${model} in the same browser profile or rerun the attach helper first.`;
    case LIVE_SITE_STATES.SITE_LOGIN_GATED:
      return `Log in to ${model} inside the active browser/profile, then rerun the live probe.`;
    case LIVE_SITE_STATES.SITE_PUBLIC_OR_AMBIGUOUS:
      return `Confirm ${model} is on a real signed-in chat workspace instead of a public landing page.`;
    case LIVE_SITE_STATES.SITE_READY_FOR_COMPARE:
    default:
      return `${model} looks ready for compare.`;
  }
};

export const describeLiveSiteResponsePathAdvisory = (
  model: ModelName,
  input: Pick<LiveSiteInspectionInput, 'hasPromptSurface' | 'hasResponseSurface' | 'hasStopControl'>
): string | null => {
  if (!input.hasPromptSurface) {
    return null;
  }

  if (input.hasResponseSurface) {
    return null;
  }

  return `${model} exposes a prompt surface, but no response container is visible yet. Treat this as response-path evidence only until compare starts.`;
};
