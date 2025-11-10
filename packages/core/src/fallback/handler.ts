/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { AuthType } from '../core/contentGenerator.js';
import { logFlashFallback, FlashFallbackEvent } from '../telemetry/index.js';
import {
  TerminalQuotaError,
  RetryableQuotaError,
} from '../utils/googleQuotaErrors.js';
import type {
  FallbackRecommendation,
  FallbackIntent,
  FallbackHandlerOutcome,
} from './types.js';
import type {
  FailureKind,
  FallbackAction,
  ModelPolicy,
} from '../availability/modelPolicy.js';
import { debugLogger } from '../utils/debugLogger.js';

export async function handleFallback(
  config: Config,
  failedModel: string,
  authType?: string,
  error?: unknown,
): Promise<FallbackHandlerOutcome | null> {
  debugLogger.log('[fallback] handleFallback invoked', {
    failedModel,
    authType,
    error: error instanceof Error ? error.message : error,
  });
  // Applicability Checks
  if (authType !== AuthType.LOGIN_WITH_GOOGLE) return null;

  const { failedPolicy, candidates } =
    config.getFallbackPolicyContext(failedModel);

  debugLogger.log('[fallback] policy context', {
    failedPolicy,
    candidateModels: candidates.map((policy) => policy.model),
  });

  if (!candidates.length) {
    return null;
  }

  const availability = config.getModelAvailabilityService();
  const selection = availability.selectFirstAvailable(
    candidates.map((policy) => policy.model),
  );

  const lastResortPolicy = candidates.find((policy) => policy.isLastResort);

  const fallbackModel = selection.selected ?? lastResortPolicy?.model ?? null;

  if (!fallbackModel || failedModel === fallbackModel) {
    debugLogger.log('[fallback] no eligible fallback model', {
      fallbackModel,
      failedModel,
      lastResort: lastResortPolicy?.model,
    });
    return null;
  }

  let failureKind: FailureKind = 'unknown';
  if (error instanceof TerminalQuotaError) {
    failureKind = 'terminal';
  } else if (error instanceof RetryableQuotaError) {
    failureKind = 'transient';
  }

  const action: FallbackAction = resolveFallbackAction(
    failureKind,
    failedPolicy,
  );

  const selectedPolicy =
    candidates.find((policy) => policy.model === fallbackModel) ??
    lastResortPolicy;

  const recommendation: FallbackRecommendation = {
    ...selection,
    selected: fallbackModel,
    action,
    failureKind,
    failedPolicy,
    selectedPolicy,
    isLastResort: fallbackModel === lastResortPolicy?.model,
  };

  debugLogger.log('[fallback] recommendation', recommendation);

  const fallbackModelHandler = config.fallbackModelHandler;
  let intent: FallbackIntent | null = null;

  try {
    if (typeof fallbackModelHandler === 'function') {
      intent = await fallbackModelHandler(failedModel, recommendation, error);
    }
  } catch (handlerError) {
    console.error('Fallback UI handler failed:', handlerError);
  }

  if (intent === null) {
    intent = action === 'silent' ? 'retry' : 'stop';
  }

  debugLogger.log('[fallback] handler intent resolved', intent);

  switch (intent) {
    case 'retry_always': {
      const previousActive = config.getActiveModel();
      const reason =
        failureKind === 'terminal'
          ? 'quota'
          : failureKind === 'transient'
            ? 'capacity'
            : 'unknown';
      availability.markTerminal(failedModel, reason);
      config.setModel(fallbackModel);
      if (previousActive !== fallbackModel && authType) {
        logFlashFallback(config, new FlashFallbackEvent(authType));
      }
      debugLogger.log('[fallback] updated active model', {
        previousActive,
        fallbackModel,
        intent,
      });
      return { shouldRetry: true, model: fallbackModel, intent };
    }

    case 'retry_once':
    case 'retry': {
      const previousActive = config.getActiveModel();
      config.setActiveModel(fallbackModel);
      if (previousActive !== fallbackModel && authType) {
        logFlashFallback(config, new FlashFallbackEvent(authType));
      }
      debugLogger.log('[fallback] updated active model', {
        previousActive,
        fallbackModel,
        intent,
      });
      return {
        shouldRetry: true,
        model: fallbackModel,
        intent,
        restoreTo: intent === 'retry_once' ? previousActive : undefined,
      };
    }
    case 'stop': {
      debugLogger.log('[fallback] handler intent resolved to stop', {
        intent,
      });
      return { shouldRetry: false, intent };
    }
    default:
      throw new Error(
        `Unexpected fallback intent received from fallbackModelHandler: "${intent}"`,
      );
  }
}

function resolveFallbackAction(
  failureKind: FailureKind,
  policy: ModelPolicy | undefined,
): FallbackAction {
  if (failureKind === 'terminal') {
    return policy?.onTerminalError ?? 'prompt';
  }
  if (failureKind === 'transient') {
    return policy?.onTransientError ?? 'prompt';
  }
  return 'prompt';
}
