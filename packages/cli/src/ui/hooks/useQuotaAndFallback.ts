/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type Config,
  type FallbackModelHandler,
  type FallbackIntent,
  type FailureKind,
  UserTierId,
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import {
  type ProQuotaDialogRequest,
  type FallbackDialogOption,
  type ResolvedModelRecommendation,
} from '../contexts/UIStateContext.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  setModelSwitchedFromQuotaError,
}: UseQuotaAndFallbackArgs) {
  const [proQuotaRequest, setProQuotaRequest] =
    useState<ProQuotaDialogRequest | null>(null);
  const isDialogPending = useRef(false);

  // Set up Flash fallback handler
  useEffect(() => {
    const fallbackHandler: FallbackModelHandler = async (
      failedModel,
      recommendation,
    ): Promise<FallbackIntent | null> => {
      // Fallbacks are currently only handled for OAuth users.
      const contentGeneratorConfig = config.getContentGeneratorConfig();
      if (
        !contentGeneratorConfig ||
        contentGeneratorConfig.authType !== AuthType.LOGIN_WITH_GOOGLE
      ) {
        return null;
      }

      // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

      const fallbackModel = recommendation.selected;
      if (!fallbackModel) {
        return null;
      }

      const resolvedRecommendation: ResolvedModelRecommendation = {
        ...recommendation,
        selected: fallbackModel,
      };

      const message = buildFallbackMessage({
        failureKind: recommendation.failureKind,
        failedModel,
        fallbackModel,
        isPaidTier,
      });

      if (message) {
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: message,
          },
          Date.now(),
        );
      }

      if (
        recommendation.failureKind === 'terminal' ||
        recommendation.failureKind === 'transient'
      ) {
        setModelSwitchedFromQuotaError(true);
        config.setQuotaErrorOccurred(true);
      }

      if (recommendation.action === 'silent') {
        return 'retry_once';
      }

      const dialogPlan = buildFallbackDialogPlan({
        failureKind: recommendation.failureKind,
        failedModel,
        fallbackModel,
      });

      if (!dialogPlan) {
        return 'stop';
      }

      if (isDialogPending.current) {
        return dialogPlan.fallbackIntent;
      }

      isDialogPending.current = true;

      const intent: FallbackIntent = await new Promise<FallbackIntent>(
        (resolve) => {
          setProQuotaRequest({
            failedModel,
            recommendation: resolvedRecommendation,
            title: dialogPlan.title,
            choices: dialogPlan.choices,
            resolve,
          });
        },
      );

      return intent;
    };

    config.setFallbackModelHandler(fallbackHandler);
  }, [config, historyManager, userTier, setModelSwitchedFromQuotaError]);

  const handleProQuotaChoice = useCallback(
    (choice: FallbackIntent) => {
      if (!proQuotaRequest) return;

      proQuotaRequest.resolve(choice);
      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here

      if (choice === 'retry_once' || choice === 'retry_always') {
        config.setQuotaErrorOccurred(false);
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: 'Switched to fallback model. Tip: Press Ctrl+P (or Up Arrow) to recall your previous prompt and submit it again if you wish.',
          },
          Date.now(),
        );
      }
    },
    [proQuotaRequest, historyManager, config],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
  };
}

interface FallbackMessageContext {
  failureKind: FailureKind;
  failedModel: string;
  fallbackModel: string;
  isPaidTier: boolean;
}

function buildFallbackMessage({
  failureKind,
  failedModel,
  isPaidTier,
}: FallbackMessageContext): string | null {
  if (failureKind === 'terminal') {
    const lines: string[] = [
      `⚡ You have reached your daily ${failedModel} quota limit.`,
      '⚡ You can choose to authenticate with a paid API key or continue with the fallback model.',
    ];
    if (isPaidTier) {
      lines.push(
        `⚡ To continue accessing the ${failedModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`,
      );
    } else {
      lines.push(
        '⚡ Increase your limits by signing up for a Gemini Code Assist Standard or Enterprise plan at https://goo.gle/set-up-gemini-code-assist',
        '⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key',
        '⚡ You can switch authentication methods by typing /auth',
      );
    }
    return lines.join('\n');
  }

  if (failureKind === 'transient') {
    return [
      '🚦 Pardon Our Congestion! It looks like we are currently overwhelmed by too many requests! We are busy fixing this.',
      '🚦 Note: You can always use /model to select a different option or wait for capacity to recover.',
    ].join('\n');
  }

  return null;
}

interface DialogPlan {
  title: string;
  choices: FallbackDialogOption[];
  fallbackIntent: FallbackIntent;
}

interface DialogPlanContext {
  failureKind: FailureKind;
  failedModel: string;
  fallbackModel: string;
}

function buildFallbackDialogPlan({
  failureKind,
  failedModel,
  fallbackModel,
}: DialogPlanContext): DialogPlan | null {
  if (failureKind === 'terminal') {
    return {
      title: `Quota limit reached for ${failedModel}`,
      choices: [
        {
          label: 'Try again later',
          intent: 'stop',
          key: 'stop',
          defaultSelected: true,
        },
        {
          label: `Switch to ${fallbackModel} for the rest of this session`,
          intent: 'retry_always',
          key: 'always',
        },
      ],
      fallbackIntent: 'stop',
    };
  }

  if (failureKind === 'transient') {
    return {
      title: `Capacity issue detected for ${failedModel}`,
      choices: [
        {
          label: `Continue with ${fallbackModel} for this request`,
          intent: 'retry_once',
          key: 'once',
          defaultSelected: true,
        },
        {
          label: `Continue with ${fallbackModel} for the rest of this session`,
          intent: 'retry_always',
          key: 'always',
        },
        {
          label: 'Stop executing',
          intent: 'stop',
          key: 'stop',
        },
      ],
      fallbackIntent: 'stop',
    };
  }

  return null;
}
