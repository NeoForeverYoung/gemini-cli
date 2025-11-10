/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { handleFallback } from './handler.js';
import type { Config } from '../config/config.js';
import { AuthType } from '../core/contentGenerator.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../config/models.js';
import { logFlashFallback } from '../telemetry/index.js';
import type { FallbackModelHandler } from './types.js';
import { RetryableQuotaError } from '../utils/googleQuotaErrors.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';

vi.mock('../telemetry/index.js', () => ({
  logFlashFallback: vi.fn(),
  FlashFallbackEvent: class {},
}));

const MOCK_PRO_MODEL = DEFAULT_GEMINI_MODEL;
const FALLBACK_MODEL = DEFAULT_GEMINI_FLASH_MODEL;
const AUTH_OAUTH = AuthType.LOGIN_WITH_GOOGLE;
const AUTH_API_KEY = AuthType.USE_GEMINI;

const createMockConfig = (overrides: Partial<Config> = {}): Config => {
  const failedPolicy = {
    model: MOCK_PRO_MODEL,
    onTerminalError: 'prompt' as const,
    onTransientError: 'prompt' as const,
    onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
    onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN' as const,
  };

  const fallbackPolicy = {
    model: FALLBACK_MODEL,
    onTerminalError: 'prompt' as const,
    onTransientError: 'prompt' as const,
    onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
    onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN' as const,
    isLastResort: true,
  };

  const availabilityStub: ModelAvailabilityService = {
    markTerminal: vi.fn(),
    markHealthy: vi.fn(),
    markUnavailableForTurn: vi.fn(),
    snapshot: vi.fn().mockReturnValue({ available: true }),
    selectFirstAvailable: vi
      .fn()
      .mockReturnValue({ selected: FALLBACK_MODEL, skipped: [] }),
    on: vi.fn(),
    resetTurn: vi.fn(),
  } as unknown as ModelAvailabilityService;

  const baseConfig: Partial<Config> = {
    getModel: vi.fn(() => MOCK_PRO_MODEL),
    getActiveModel: vi.fn(() => MOCK_PRO_MODEL),
    setActiveModel: vi.fn(),
    setModel: vi.fn(function mockSetModel(this: Config, model: string) {
      (this.setActiveModel as Mock)(model);
    }),
    getFallbackPolicyContext: vi.fn(() => ({
      failedPolicy,
      candidates: [fallbackPolicy],
    })),
    getModelPolicies: vi.fn(() => [failedPolicy, fallbackPolicy]),
    getFallbackModelCandidates: vi.fn(() => [FALLBACK_MODEL]),
    getModelAvailabilityService: vi.fn(() => availabilityStub),
  };

  return {
    ...baseConfig,
    ...overrides,
  } as unknown as Config;
};

describe('handleFallback', () => {
  let mockConfig: Config;
  let mockHandler: Mock<FallbackModelHandler>;
  let consoleErrorSpy: MockInstance;
  let setActiveModelSpy: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandler = vi.fn();
    mockConfig = createMockConfig({
      fallbackModelHandler: mockHandler,
    });
    setActiveModelSpy = mockConfig.setActiveModel as unknown as Mock;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns null when auth type is not OAuth', async () => {
    const result = await handleFallback(
      mockConfig,
      MOCK_PRO_MODEL,
      AUTH_API_KEY,
    );
    expect(result).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
    expect(setActiveModelSpy).not.toHaveBeenCalled();
  });

  it('returns null when the failed model already matches the fallback', async () => {
    const result = await handleFallback(mockConfig, FALLBACK_MODEL, AUTH_OAUTH);
    expect(result).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
    expect(setActiveModelSpy).not.toHaveBeenCalled();
  });

  it('applies fallback and logs when handler resolves to retry', async () => {
    mockHandler.mockResolvedValue('retry');

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toEqual({
      shouldRetry: true,
      model: FALLBACK_MODEL,
      intent: 'retry',
    });
    expect(setActiveModelSpy).toHaveBeenCalledWith(FALLBACK_MODEL);
    expect(logFlashFallback).toHaveBeenCalledTimes(1);
  });

  it('defaults to retry for silent policies when no handler is provided', async () => {
    const configWithoutHandler = createMockConfig({
      fallbackModelHandler: undefined,
    });

    const silentPolicy = {
      model: MOCK_PRO_MODEL,
      onTerminalError: 'prompt' as const,
      onTransientError: 'silent' as const,
      onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
      onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN' as const,
    };

    const fallbackPolicy = {
      model: FALLBACK_MODEL,
      onTerminalError: 'prompt' as const,
      onTransientError: 'prompt' as const,
      onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
      onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN' as const,
      isLastResort: true,
    };

    (configWithoutHandler.getFallbackPolicyContext as Mock).mockReturnValue({
      failedPolicy: silentPolicy,
      candidates: [fallbackPolicy],
    });

    (configWithoutHandler.getModelPolicies as Mock).mockReturnValue([
      silentPolicy,
      fallbackPolicy,
    ]);

    const result = await handleFallback(
      configWithoutHandler,
      MOCK_PRO_MODEL,
      AUTH_OAUTH,
      new RetryableQuotaError('retryable', {} as never, 1),
    );

    expect(result).toEqual({
      shouldRetry: true,
      model: FALLBACK_MODEL,
      intent: 'retry',
    });
    expect(configWithoutHandler.setActiveModel).toHaveBeenCalledWith(
      FALLBACK_MODEL,
    );
  });

  describe('when handler returns "stop"', () => {
    it('should return false and not apply fallback', async () => {
      mockHandler.mockResolvedValue('stop');

      const result = await handleFallback(
        mockConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toEqual({ shouldRetry: false, intent: 'stop' });
      expect(setActiveModelSpy).not.toHaveBeenCalled();
      expect(logFlashFallback).not.toHaveBeenCalled();
    });
  });

  describe('when handler returns an unexpected value', () => {
    it('should log an error and return stop intent', async () => {
      mockHandler.mockResolvedValue(null);

      const result = await handleFallback(
        mockConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toEqual({ shouldRetry: false, intent: 'stop' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Fallback UI handler failed:',
        new Error(
          'Unexpected fallback intent received from fallbackModelHandler: "null"',
        ),
      );
      expect(setActiveModelSpy).not.toHaveBeenCalled();
    });
  });

  it('should pass the correct context (failedModel, fallbackModel, error) to the handler', async () => {
    const mockError = new Error('Quota Exceeded');
    mockHandler.mockResolvedValue('retry');

    await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH, mockError);

    expect(mockHandler).toHaveBeenCalledWith(
      MOCK_PRO_MODEL,
      FALLBACK_MODEL,
      mockError,
    );
    expect(logFlashFallback).toHaveBeenCalledTimes(1);
  });

  it('returns false but still applies fallback when handler resolves to stop', async () => {
    mockHandler.mockResolvedValue('stop');

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toEqual({ shouldRetry: false, intent: 'stop' });
    expect(setActiveModelSpy).not.toHaveBeenCalled();
    expect(logFlashFallback).not.toHaveBeenCalled();
  });

  it('marks the failed model as terminal when handler resolves to retry_always', async () => {
    mockHandler.mockResolvedValue('retry_always');

    const availability = mockConfig.getModelAvailabilityService();
    const setModelSpy = mockConfig.setModel as Mock;

    const result = await handleFallback(
      mockConfig,
      MOCK_PRO_MODEL,
      AUTH_OAUTH,
      new RetryableQuotaError('capacity', {} as never, 1),
    );

    expect(result).toEqual({
      shouldRetry: true,
      model: FALLBACK_MODEL,
      intent: 'retry_always',
    });
    expect(setActiveModelSpy).toHaveBeenCalledWith(FALLBACK_MODEL);
    expect(availability.markTerminal).toHaveBeenCalledWith(
      MOCK_PRO_MODEL,
      'capacity',
    );
    expect(setModelSpy).toHaveBeenCalledWith(FALLBACK_MODEL);
  });

  it('retries once without marking terminal when handler resolves to retry_once', async () => {
    mockHandler.mockResolvedValue('retry_once');

    const availability = mockConfig.getModelAvailabilityService();
    const setModelSpy = mockConfig.setModel as Mock;

    const result = await handleFallback(
      mockConfig,
      MOCK_PRO_MODEL,
      AUTH_OAUTH,
      new RetryableQuotaError('capacity', {} as never, 1),
    );

    expect(result).toEqual({
      shouldRetry: true,
      model: FALLBACK_MODEL,
      intent: 'retry_once',
      restoreTo: MOCK_PRO_MODEL,
    });
    expect(setActiveModelSpy).toHaveBeenCalledWith(FALLBACK_MODEL);
    expect(availability.markTerminal).not.toHaveBeenCalled();
    expect(setModelSpy).not.toHaveBeenCalled();
  });

  it('uses last-resort model when availability returns no candidates', async () => {
    const availabilityWithNone = {
      markTerminal: vi.fn(),
      markHealthy: vi.fn(),
      markUnavailableForTurn: vi.fn(),
      snapshot: vi.fn().mockReturnValue({ available: false, reason: 'quota' }),
      selectFirstAvailable: vi.fn().mockReturnValue({
        selected: null,
        skipped: [{ model: FALLBACK_MODEL, reason: 'quota' }],
      }),
      on: vi.fn(),
      resetTurn: vi.fn(),
    } as unknown as ModelAvailabilityService;

    const configWithLastResort = createMockConfig({
      fallbackModelHandler: mockHandler,
      getModelAvailabilityService: vi.fn(() => availabilityWithNone),
    });

    mockHandler.mockResolvedValue('retry');

    const result = await handleFallback(
      configWithLastResort,
      MOCK_PRO_MODEL,
      AUTH_OAUTH,
    );

    expect(result).toEqual({
      shouldRetry: true,
      model: FALLBACK_MODEL,
      intent: 'retry',
    });
    expect(configWithLastResort.setActiveModel).toHaveBeenCalledWith(
      FALLBACK_MODEL,
    );
  });

  it('skips telemetry when already on the fallback model', async () => {
    const configAlreadyFallback = createMockConfig({
      getActiveModel: vi.fn(() => FALLBACK_MODEL),
      fallbackModelHandler: mockHandler,
    });

    mockHandler.mockResolvedValue('retry');

    const result = await handleFallback(
      configAlreadyFallback,
      MOCK_PRO_MODEL,
      AUTH_OAUTH,
    );

    expect(result).toEqual({
      shouldRetry: true,
      model: FALLBACK_MODEL,
      intent: 'retry',
    });
    expect(configAlreadyFallback.setActiveModel).toHaveBeenCalledWith(
      FALLBACK_MODEL,
    );
    expect(logFlashFallback).not.toHaveBeenCalled();
  });

  it('logs handler failures and still applies fallback', async () => {
    const handlerError = new Error('UI interaction failed');
    mockHandler.mockRejectedValue(handlerError);

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toEqual({ shouldRetry: false, intent: 'stop' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Fallback UI handler failed:',
      handlerError,
    );
    expect(setActiveModelSpy).not.toHaveBeenCalled();
  });
});
