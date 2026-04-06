import type { ModelName } from '../utils/types';
import { Logger, toErrorMessage } from '../utils/logger';
import {
  SWITCHYARD_RUNTIME_BASE_URL,
  getSwitchyardRuntimeTarget,
} from '../services/analysis/providers/switchyardRuntime';

const SWITCHYARD_RUNTIME_INVOKE_URL = `${SWITCHYARD_RUNTIME_BASE_URL}/v1/runtime/invoke`;

type SwitchyardRuntimeInvokeResponse = {
  ok: boolean;
  provider?: string;
  model?: string;
  lane?: string;
  text?: string;
  outputText?: string;
  providerMessageId?: string;
  error?: {
    type?: string;
    category?: string;
    suggestedAction?: string;
  };
  auth?: {
    providerId?: string;
    transportHint?: string;
  };
};

type SwitchyardRuntimeFailureKind =
  | 'runtime_unavailable'
  | 'runtime_auth_required'
  | 'runtime_model_unsupported'
  | 'runtime_error';

type SwitchyardRuntimeSuccess = {
  ok: true;
  rawText: string;
  provider: string;
  model: string;
};

type SwitchyardRuntimeFailure = {
  ok: false;
  kind: SwitchyardRuntimeFailureKind;
  message: string;
  details?: Record<string, unknown>;
};

export type SwitchyardRuntimeAnalysisResult =
  | SwitchyardRuntimeSuccess
  | SwitchyardRuntimeFailure;

class SwitchyardServiceHttpError extends Error {
  status: number;
  payload?: SwitchyardRuntimeInvokeResponse;

  constructor(status: number, payload?: SwitchyardRuntimeInvokeResponse) {
    super(`switchyard_runtime_http_${status}`);
    this.status = status;
    this.payload = payload;
  }
}

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  let payload: T | undefined;

  try {
    payload = (await response.json()) as T;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    throw new SwitchyardServiceHttpError(
      response.status,
      payload as SwitchyardRuntimeInvokeResponse | undefined
    );
  }

  return payload as T;
};

const buildRuntimeFailureMessage = (
  payload?: SwitchyardRuntimeInvokeResponse,
  fallback = 'Prompt Switchboard could not reach the local Switchyard runtime.'
) => payload?.auth?.transportHint ?? payload?.error?.suggestedAction ?? fallback;

export const runSwitchyardCompareAnalysis = async ({
  analystModel,
  prompt,
}: {
  analystModel: ModelName;
  prompt: string;
}): Promise<SwitchyardRuntimeAnalysisResult> => {
  const target = getSwitchyardRuntimeTarget(analystModel);
  if (!target) {
    return {
      ok: false,
      kind: 'runtime_model_unsupported',
      message: `The local Switchyard runtime lane does not currently expose a ${analystModel} analysis mapping.`,
      details: {
        analystModel,
      },
    };
  }

  try {
    const payload = await requestJson<SwitchyardRuntimeInvokeResponse>(
      SWITCHYARD_RUNTIME_INVOKE_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          provider: target.provider,
          model: target.model,
          input: prompt,
          lane: target.invokeRoute,
        }),
      }
    );

    const rawText = payload.outputText?.trim() ? payload.outputText : payload.text;

    if (!rawText?.trim()) {
      return {
        ok: false,
        kind: 'runtime_error',
        message:
          'The local Switchyard runtime responded, but it did not return usable analysis text.',
        details: {
          provider: payload.provider ?? target.provider,
          model: payload.model ?? target.model,
        },
      };
    }

    return {
      ok: true,
      rawText,
      provider: payload.provider ?? target.provider,
      model: payload.model ?? target.model,
    };
  } catch (error) {
    if (error instanceof SwitchyardServiceHttpError) {
      const failureType = error.payload?.error?.type;
      if (
        failureType === 'missing-credential' ||
        failureType === 'user-action-required' ||
        failureType === 'session-incomplete'
      ) {
        return {
          ok: false,
          kind: 'runtime_auth_required',
          message: buildRuntimeFailureMessage(
            error.payload,
            'Switchyard needs a local auth or session handoff before it can run this analysis lane.'
          ),
          details: {
            status: error.status,
            provider: target.provider,
            failureType,
          },
        };
      }

      return {
        ok: false,
        kind: 'runtime_unavailable',
        message: buildRuntimeFailureMessage(
          error.payload,
          'Switchyard is reachable, but the requested runtime lane is not ready yet.'
        ),
        details: {
          status: error.status,
          provider: target.provider,
          failureType: failureType ?? 'runtime_http_error',
        },
      };
    }

    Logger.error('switchyard_runtime_invoke_failed', {
      surface: 'background',
      code: 'switchyard_runtime_invoke_failed',
      error: toErrorMessage(error),
      analystModel,
      provider: target.provider,
    });

    return {
      ok: false,
      kind: 'runtime_unavailable',
      message:
        'Prompt Switchboard could not reach the local Switchyard runtime on http://127.0.0.1:4317.',
      details: {
        analystModel,
        provider: target.provider,
      },
    };
  }
};
