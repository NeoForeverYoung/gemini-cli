/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import {
  type Config,
  type FallbackModelHandler,
  type FallbackIntent,
  UserTierId,
  AuthType,
  makeFakeConfig,
} from '@google/gemini-cli-core';
import { useQuotaAndFallback } from './useQuotaAndFallback.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import type { ResolvedModelRecommendation } from '../contexts/UIStateContext.js';

interface TestHandlerContext {
  handler: FallbackModelHandler;
  rerender: (userTier: UserTierId) => void;
  getState: () => ReturnType<typeof useQuotaAndFallback>;
}

const recommendationFor = (
  model: string,
  overrides: Partial<ResolvedModelRecommendation> = {},
): ResolvedModelRecommendation => ({
  selected: model,
  skipped: [],
  action: 'prompt',
  failureKind: 'terminal',
  ...overrides,
});

describe('useQuotaAndFallback', () => {
  let mockConfig: Config;
  let mockHistoryManager: UseHistoryManagerReturn;
  let mockSetModelSwitchedFromQuotaError: Mock;
  let setFallbackHandlerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConfig = makeFakeConfig();
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });

    mockHistoryManager = {
      addItem: vi.fn(),
      history: [],
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    };

    mockSetModelSwitchedFromQuotaError = vi.fn();
    setFallbackHandlerSpy = vi.spyOn(mockConfig, 'setFallbackModelHandler');
    vi.spyOn(mockConfig, 'setQuotaErrorOccurred');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderHookWithConfig = (
    userTier: UserTierId = UserTierId.FREE,
  ): TestHandlerContext => {
    const hook = renderHook(
      (props) =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: props.userTier,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
        }),
      { initialProps: { userTier } },
    );

    const handler = setFallbackHandlerSpy.mock
      .calls[0][0] as FallbackModelHandler;

    return {
      handler,
      rerender: (tier: UserTierId) => hook.rerender({ userTier: tier }),
      getState: () => hook.result.current,
    };
  };

  it('registers a fallback handler on initialization', () => {
    renderHookWithConfig();
    expect(setFallbackHandlerSpy).toHaveBeenCalledTimes(1);
    expect(setFallbackHandlerSpy.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  it('returns null when auth type is not LOGIN_WITH_GOOGLE', async () => {
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: AuthType.USE_GEMINI,
    });
    const { handler } = renderHookWithConfig();
    const result = await handler(
      'gemini-pro',
      recommendationFor('gemini-flash'),
      new Error('test'),
    );
    expect(result).toBeNull();
  });

  it('performs a silent fallback by retrying automatically', async () => {
    const { handler } = renderHookWithConfig(UserTierId.FREE);

    const result = await handler(
      'model-A',
      recommendationFor('model-B', {
        action: 'silent',
        failureKind: 'transient',
      }),
      new Error('transient'),
    );

    expect(result).toBe('retry_once');
    const expectedTransientMessage = [
      '🚦 Pardon Our Congestion! It looks like we are currently overwhelmed by too many requests! We are busy fixing this.',
      '🚦 Note: You can always use /model to select a different option or wait for capacity to recover.',
    ].join('\n');
    expect(mockHistoryManager.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: expectedTransientMessage,
      },
      expect.any(Number),
    );
    expect(mockSetModelSwitchedFromQuotaError).not.toHaveBeenCalled();
    expect(mockConfig.setQuotaErrorOccurred).not.toHaveBeenCalled();
  });

  it('prompts the user with quota-specific options when the policy requests confirmation', async () => {
    const { handler, getState } = renderHookWithConfig(UserTierId.FREE);

    let intentPromise: Promise<FallbackIntent | null>;
    await act(async () => {
      intentPromise = handler(
        'gemini-pro',
        recommendationFor('gemini-flash', {
          action: 'prompt',
          failureKind: 'terminal',
        }),
        new Error('quota'),
      );
    });

    const { proQuotaRequest } = getState();
    expect(proQuotaRequest).not.toBeNull();
    expect(proQuotaRequest?.recommendation.selected).toBe('gemini-flash');
    expect(proQuotaRequest?.title).toContain('Quota limit');
    expect(proQuotaRequest?.choices.map((choice) => choice.intent)).toEqual([
      'stop',
      'retry_always',
    ]);

    await act(async () => {
      proQuotaRequest?.resolve('retry_always');
    });

    const intent = await intentPromise!;
    expect(intent).toBe('retry_always');
    expect(mockSetModelSwitchedFromQuotaError).toHaveBeenCalledWith(true);
    expect(mockConfig.setQuotaErrorOccurred).toHaveBeenCalledWith(true);
    const expectedQuotaMessage = [
      '⚡ You have reached your daily gemini-pro quota limit.',
      '⚡ You can choose to authenticate with a paid API key or continue with the fallback model.',
      '⚡ Increase your limits by signing up for a Gemini Code Assist Standard or Enterprise plan at https://goo.gle/set-up-gemini-code-assist',
      '⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key',
      '⚡ You can switch authentication methods by typing /auth',
    ].join('\n');
    expect(mockHistoryManager.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: expectedQuotaMessage,
      },
      expect.any(Number),
    );
  });

  it('prompts with capacity options for transient failures', async () => {
    const { handler, getState } = renderHookWithConfig(UserTierId.STANDARD);

    let intentPromise: Promise<FallbackIntent | null>;
    await act(async () => {
      intentPromise = handler(
        'gemini-pro',
        recommendationFor('gemini-flash', {
          action: 'prompt',
          failureKind: 'transient',
        }),
        new Error('capacity'),
      );
    });

    const { proQuotaRequest } = getState();
    expect(proQuotaRequest).not.toBeNull();
    expect(proQuotaRequest?.choices.map((choice) => choice.intent)).toEqual([
      'retry_once',
      'retry_always',
      'stop',
    ]);

    await act(async () => {
      proQuotaRequest?.resolve('retry_once');
    });

    const intent = await intentPromise!;
    expect(intent).toBe('retry_once');
    expect(mockSetModelSwitchedFromQuotaError).not.toHaveBeenCalled();
    expect(mockConfig.setQuotaErrorOccurred).not.toHaveBeenCalled();
    expect(mockHistoryManager.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Pardon Our Congestion'),
      }),
      expect.any(Number),
    );
  });

  it('handleProQuotaChoice resolves the pending intent and logs follow-up message', async () => {
    const { handler, getState } = renderHookWithConfig(UserTierId.FREE);

    let intentPromise: Promise<FallbackIntent | null>;
    await act(async () => {
      intentPromise = handler(
        'gemini-pro',
        recommendationFor('gemini-flash', {
          action: 'prompt',
          failureKind: 'terminal',
        }),
        new Error('quota'),
      );
    });

    const { proQuotaRequest, handleProQuotaChoice } = getState();
    expect(proQuotaRequest).not.toBeNull();

    await act(async () => {
      handleProQuotaChoice('retry_always');
    });

    const intent = await intentPromise!;
    expect(intent).toBe('retry_always');
    expect(mockHistoryManager.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Switched to fallback model'),
      }),
      expect.any(Number),
    );
  });
});
