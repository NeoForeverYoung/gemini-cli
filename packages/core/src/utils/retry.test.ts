/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@google/genai';
import { AuthType } from '../core/contentGenerator.js';
import { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import type { HttpError } from './retry.js';
import { retryWithBackoff } from './retry.js';
import type { Config } from '../config/config.js';
import type { FallbackHandlerOutcome } from '../fallback/types.js';
import { setSimulate429 } from './testUtils.js';
import { debugLogger } from './debugLogger.js';
import {
  TerminalQuotaError,
  RetryableQuotaError,
} from './googleQuotaErrors.js';

// Helper to create a mock function that fails a certain number of times
const createFailingFunction = (
  failures: number,
  successValue: string = 'success',
) => {
  let attempts = 0;
  return vi.fn(async () => {
    attempts++;
    if (attempts <= failures) {
      // Simulate a retryable error
      const error: HttpError = new Error(`Simulated error attempt ${attempts}`);
      error.status = 500; // Simulate a server error
      throw error;
    }
    return successValue;
  });
};

// Custom error for testing non-retryable conditions
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Disable 429 simulation for tests
    setSimulate429(false);
    // Suppress unhandled promise rejection warnings for tests that expect errors
    debugLogger.warn = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return the result on the first attempt if successful', async () => {
    const mockFn = createFailingFunction(0);
    const result = await retryWithBackoff(mockFn);
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed if failures are within maxAttempts', async () => {
    const mockFn = createFailingFunction(2);
    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    await vi.runAllTimersAsync(); // Ensure all delays and retries complete

    const result = await promise;
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should throw an error if all attempts fail', async () => {
    const mockFn = createFailingFunction(3);

    // 1. Start the retryable operation, which returns a promise.
    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    // 2. Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise).rejects.toThrow('Simulated error attempt 3'),
      vi.runAllTimersAsync(),
    ]);

    // 3. Finally, assert the number of calls.
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should default to 3 maxAttempts if no options are provided', async () => {
    // This function will fail more than 3 times to ensure all retries are used.
    const mockFn = createFailingFunction(10);

    const promise = retryWithBackoff(mockFn);

    // Expect it to fail with the error from the 5th attempt.
    await Promise.all([
      expect(promise).rejects.toThrow('Simulated error attempt 3'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should default to 3 maxAttempts if options.maxAttempts is undefined', async () => {
    // This function will fail more than 3 times to ensure all retries are used.
    const mockFn = createFailingFunction(10);

    const promise = retryWithBackoff(mockFn, { maxAttempts: undefined });

    // Expect it to fail with the error from the 5th attempt.
    await Promise.all([
      expect(promise).rejects.toThrow('Simulated error attempt 3'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry if shouldRetry returns false', async () => {
    const mockFn = vi.fn(async () => {
      throw new NonRetryableError('Non-retryable error');
    });
    const shouldRetryOnError = (error: Error) =>
      !(error instanceof NonRetryableError);

    const promise = retryWithBackoff(mockFn, {
      shouldRetryOnError,
      initialDelayMs: 10,
    });

    await expect(promise).rejects.toThrow('Non-retryable error');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if maxAttempts is not a positive number', async () => {
    const mockFn = createFailingFunction(1);

    // Test with 0
    await expect(retryWithBackoff(mockFn, { maxAttempts: 0 })).rejects.toThrow(
      'maxAttempts must be a positive number.',
    );

    // The function should not be called at all if validation fails
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('should use default shouldRetry if not provided, retrying on ApiError 429', async () => {
    const mockFn = vi.fn(async () => {
      throw new ApiError({ message: 'Too Many Requests', status: 429 });
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    await Promise.all([
      expect(promise).rejects.toThrow('Too Many Requests'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should use default shouldRetry if not provided, not retrying on ApiError 400', async () => {
    const mockFn = vi.fn(async () => {
      throw new ApiError({ message: 'Bad Request', status: 400 });
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });
    await expect(promise).rejects.toThrow('Bad Request');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should use default shouldRetry if not provided, retrying on generic error with status 429', async () => {
    const mockFn = vi.fn(async () => {
      const error = new Error('Too Many Requests') as any;
      error.status = 429;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    // Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise).rejects.toThrow('Too Many Requests'),
      vi.runAllTimersAsync(),
    ]);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('applies terminal policy directives when a terminal quota error occurs', async () => {
    const service = new ModelAvailabilityService();
    const markTerminalSpy = vi.spyOn(service, 'markTerminal');
    const markUnavailableForTurnSpy = vi.spyOn(
      service,
      'markUnavailableForTurn',
    );
    vi.spyOn(service, 'markHealthy');

    const policy = {
      model: 'gemini-2.5-pro',
      onTerminalError: 'silent' as const,
      onTransientError: 'prompt' as const,
      onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
      onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN' as const,
    };

    const terminalError = new TerminalQuotaError('quota', {
      code: 429,
      message: 'quota',
      details: [],
    } as never);

    await expect(
      retryWithBackoff(
        async () => {
          throw terminalError;
        },
        {
          maxAttempts: 1,
          availability: {
            service,
            currentModel: 'gemini-2.5-pro',
            currentPolicy: policy,
          },
        },
      ),
    ).rejects.toBe(terminalError);

    expect(markTerminalSpy).toHaveBeenCalledWith('gemini-2.5-pro', 'quota');
    expect(markUnavailableForTurnSpy).not.toHaveBeenCalled();
  });

  it('applies transient policy directives when retryable quota errors persist', async () => {
    const service = new ModelAvailabilityService();
    const markTerminalSpy = vi.spyOn(service, 'markTerminal');
    const markUnavailableForTurnSpy = vi.spyOn(
      service,
      'markUnavailableForTurn',
    );
    vi.spyOn(service, 'markHealthy');

    const policy = {
      model: 'gemini-2.5-pro',
      onTerminalError: 'silent' as const,
      onTransientError: 'prompt' as const,
      onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
      onRetryFailureState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
    };

    const retryableError = new RetryableQuotaError(
      'throttled',
      {
        code: 429,
        message: 'throttled',
        details: [],
      } as never,
      1,
    );

    const promise = retryWithBackoff(
      async () => {
        throw retryableError;
      },
      {
        maxAttempts: 2,
        availability: {
          service,
          currentModel: 'gemini-2.5-pro',
          currentPolicy: policy,
        },
      },
    );

    await Promise.all([
      expect(promise).rejects.toBe(retryableError),
      vi.runAllTimersAsync(),
    ]);

    expect(markUnavailableForTurnSpy).not.toHaveBeenCalled();
    expect(markTerminalSpy).toHaveBeenCalledWith('gemini-2.5-pro', 'capacity');
  });

  it('gracefully skips directives when availability policy is missing for a terminal error', async () => {
    const service = new ModelAvailabilityService();
    const markTerminalSpy = vi.spyOn(service, 'markTerminal');
    const markUnavailableForTurnSpy = vi.spyOn(
      service,
      'markUnavailableForTurn',
    );
    vi.spyOn(service, 'markHealthy');

    const terminalError = new TerminalQuotaError('quota', {
      code: 429,
      message: 'quota',
      details: [],
    } as never);

    await expect(
      retryWithBackoff(
        async () => {
          throw terminalError;
        },
        {
          maxAttempts: 1,
          availability: {
            service,
            currentModel: 'gemini-2.5-pro',
            currentPolicy: undefined,
          },
        },
      ),
    ).rejects.toBe(terminalError);

    expect(markTerminalSpy).not.toHaveBeenCalled();
    expect(markUnavailableForTurnSpy).not.toHaveBeenCalled();
  });

  it('should use default shouldRetry if not provided, not retrying on generic error with status 400', async () => {
    const mockFn = vi.fn(async () => {
      const error = new Error('Bad Request') as any;
      error.status = 400;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });
    await expect(promise).rejects.toThrow('Bad Request');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should respect maxDelayMs', async () => {
    const mockFn = createFailingFunction(3);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      maxDelayMs: 250, // Max delay is less than 100 * 2 * 2 = 400
    });

    await vi.advanceTimersByTimeAsync(1000); // Advance well past all delays
    await promise;

    const delays = setTimeoutSpy.mock.calls.map((call) => call[1] as number);

    // Delays should be around initial, initial*2, maxDelay (due to cap)
    // Jitter makes exact assertion hard, so we check ranges / caps
    expect(delays.length).toBe(3);
    expect(delays[0]).toBeGreaterThanOrEqual(100 * 0.7);
    expect(delays[0]).toBeLessThanOrEqual(100 * 1.3);
    expect(delays[1]).toBeGreaterThanOrEqual(200 * 0.7);
    expect(delays[1]).toBeLessThanOrEqual(200 * 1.3);
    // The third delay should be capped by maxDelayMs (250ms), accounting for jitter
    expect(delays[2]).toBeGreaterThanOrEqual(250 * 0.7);
    expect(delays[2]).toBeLessThanOrEqual(250 * 1.3);
  });

  it('should handle jitter correctly, ensuring varied delays', async () => {
    let mockFn = createFailingFunction(5);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    // Run retryWithBackoff multiple times to observe jitter
    const runRetry = () =>
      retryWithBackoff(mockFn, {
        maxAttempts: 2, // Only one retry, so one delay
        initialDelayMs: 100,
        maxDelayMs: 1000,
      });

    // We expect rejections as mockFn fails 5 times
    const promise1 = runRetry();
    // Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise1).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

    const firstDelaySet = setTimeoutSpy.mock.calls.map(
      (call) => call[1] as number,
    );
    setTimeoutSpy.mockClear(); // Clear calls for the next run

    // Reset mockFn to reset its internal attempt counter for the next run
    mockFn = createFailingFunction(5); // Re-initialize with 5 failures

    const promise2 = runRetry();
    // Run timers and await expectation in parallel.
    await Promise.all([
      expect(promise2).rejects.toThrow(),
      vi.runAllTimersAsync(),
    ]);

    const secondDelaySet = setTimeoutSpy.mock.calls.map(
      (call) => call[1] as number,
    );

    // Check that the delays are not exactly the same due to jitter
    // This is a probabilistic test, but with +/-30% jitter, it's highly likely they differ.
    if (firstDelaySet.length > 0 && secondDelaySet.length > 0) {
      // Check the first delay of each set
      expect(firstDelaySet[0]).not.toBe(secondDelaySet[0]);
    } else {
      // If somehow no delays were captured (e.g. test setup issue), fail explicitly
      throw new Error('Delays were not captured for jitter test');
    }

    // Ensure delays are within the expected jitter range [70, 130] for initialDelayMs = 100
    [...firstDelaySet, ...secondDelaySet].forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(100 * 0.7);
      expect(d).toBeLessThanOrEqual(100 * 1.3);
    });
  });

  describe('Fetch error retries', () => {
    const fetchErrorMsg = 'exception TypeError: fetch failed sending request';

    it('should retry on specific fetch error when retryFetchErrors is true', async () => {
      const mockFn = vi.fn();
      mockFn.mockRejectedValueOnce(new Error(fetchErrorMsg));
      mockFn.mockResolvedValueOnce('success');

      const promise = retryWithBackoff(mockFn, {
        retryFetchErrors: true,
        initialDelayMs: 10,
      });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it.each([false, undefined])(
      'should not retry on specific fetch error when retryFetchErrors is %s',
      async (retryFetchErrors) => {
        const mockFn = vi.fn().mockRejectedValue(new Error(fetchErrorMsg));

        const promise = retryWithBackoff(mockFn, {
          retryFetchErrors,
        });

        await expect(promise).rejects.toThrow(fetchErrorMsg);
        expect(mockFn).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('Flash model fallback for OAuth users', () => {
    const createMockConfig = () => {
      const setActiveModel = vi.fn();
      const getModelPolicy = vi.fn().mockReturnValue({
        model: 'original-model',
        onTerminalError: 'prompt',
        onTransientError: 'prompt',
        onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE' as const,
        onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN' as const,
      });
      return {
        setActiveModel,
        getModelPolicy,
      };
    };

    it('applies retry_once fallback for a single attempt and restores afterwards', async () => {
      const config = createMockConfig();
      const availability = {
        service: new ModelAvailabilityService(),
        currentModel: 'original-model',
        currentPolicy: config.getModelPolicy('original-model'),
      };
      const fallbackOutcome: FallbackHandlerOutcome = {
        shouldRetry: true,
        model: 'fallback-model',
        intent: 'retry_once',
        restoreTo: 'original-model',
      };

      let attemptCount = 0;
      const mockFn = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new TerminalQuotaError('Daily limit reached', {} as any);
        }
        if (attemptCount === 2) {
          throw new Error('fallback failed');
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        availability,
        config: config as unknown as Config,
        onPersistent429: vi
          .fn()
          .mockResolvedValueOnce(fallbackOutcome)
          .mockResolvedValue(null),
        authType: AuthType.LOGIN_WITH_GOOGLE,
      });

      await expect(promise).rejects.toThrow('fallback failed');

      expect(config.setActiveModel).toHaveBeenNthCalledWith(
        1,
        'fallback-model',
      );
      expect(config.setActiveModel).toHaveBeenNthCalledWith(
        2,
        'original-model',
      );
      expect(config.setActiveModel).toHaveBeenCalledTimes(2);
    });

    it('keeps fallback active for retry intent without restore', async () => {
      const config = createMockConfig();
      const availability = {
        service: new ModelAvailabilityService(),
        currentModel: 'original-model',
        currentPolicy: config.getModelPolicy('original-model'),
      };
      const fallbackOutcome: FallbackHandlerOutcome = {
        shouldRetry: true,
        model: 'fallback-model',
        intent: 'retry',
      };

      let attemptCount = 0;
      const mockFn = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new TerminalQuotaError('Daily limit reached', {} as any);
        }
        if (attemptCount === 2) {
          throw new Error('fallback failed');
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        availability,
        config: config as unknown as Config,
        onPersistent429: vi
          .fn()
          .mockResolvedValueOnce(fallbackOutcome)
          .mockResolvedValue(null),
        authType: AuthType.LOGIN_WITH_GOOGLE,
      });

      await expect(promise).rejects.toThrow('fallback failed');

      expect(config.setActiveModel).toHaveBeenNthCalledWith(
        1,
        'fallback-model',
      );
      expect(config.setActiveModel).not.toHaveBeenCalledWith('original-model');
    });

    it('should trigger fallback for OAuth personal users on TerminalQuotaError', async () => {
      const fallbackOutcome = {
        shouldRetry: true,
        model: 'gemini-2.5-flash',
        intent: 'retry' as const,
      };
      const fallbackCallback = vi.fn().mockResolvedValue(fallbackOutcome);

      let fallbackOccurred = false;
      const mockFn = vi.fn().mockImplementation(async () => {
        if (!fallbackOccurred) {
          throw new TerminalQuotaError('Daily limit reached', {} as any);
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        onPersistent429: async (authType?: string, error?: unknown) => {
          fallbackOccurred = true;
          return await fallbackCallback(authType, error);
        },
        authType: 'oauth-personal',
      });

      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe('success');
      expect(fallbackCallback).toHaveBeenCalledWith(
        'oauth-personal',
        expect.any(TerminalQuotaError),
      );
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should use retryDelayMs from RetryableQuotaError', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const mockFn = vi.fn().mockImplementation(async () => {
        throw new RetryableQuotaError('Per-minute limit', {} as any, 12.345);
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 2,
        initialDelayMs: 100,
      });

      // Attach the rejection expectation *before* running timers
      const assertionPromise = await expect(promise).rejects.toThrow();

      // Advance time to trigger the retry delay (12345ms)
      await vi.advanceTimersByTimeAsync(12345 + 100);

      await assertionPromise;

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 12345);
    });

    it.each([[AuthType.USE_GEMINI], [AuthType.USE_VERTEX_AI], [undefined]])(
      'should not trigger fallback for non-Google auth users (authType: %s) on TerminalQuotaError',
      async (authType) => {
        const fallbackCallback = vi.fn();
        const mockFn = vi.fn().mockImplementation(async () => {
          throw new TerminalQuotaError('Daily limit reached', {} as any);
        });

        const promise = retryWithBackoff(mockFn, {
          maxAttempts: 3,
          onPersistent429: fallbackCallback,
          authType,
        });

        await expect(promise).rejects.toThrow('Daily limit reached');
        expect(fallbackCallback).not.toHaveBeenCalled();
        expect(mockFn).toHaveBeenCalledTimes(1);
      },
    );
  });
  it('should abort the retry loop when the signal is aborted', async () => {
    const abortController = new AbortController();
    const mockFn = vi.fn().mockImplementation(async () => {
      const error: HttpError = new Error('Server error');
      error.status = 500;
      throw error;
    });

    const promise = retryWithBackoff(mockFn, {
      maxAttempts: 5,
      initialDelayMs: 100,
      signal: abortController.signal,
    });
    await vi.advanceTimersByTimeAsync(50);
    abortController.abort();

    await expect(promise).rejects.toThrow(
      expect.objectContaining({ name: 'AbortError' }),
    );
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  describe('Verification Scenarios', () => {
    const createMockConfig = () => {
      const setActiveModel = vi.fn();
      const getModelPolicy = vi.fn();
      const getActiveModel = vi.fn();
      return {
        setActiveModel,
        getModelPolicy,
        getActiveModel,
      };
    };

    const createAvailabilityContext = (
      service: ModelAvailabilityService,
      model: string,
      policy: any,
    ) => ({
      service,
      currentModel: model,
      currentPolicy: policy,
    });

    it('Scenario A: Primary model fails with TerminalQuotaError (Quota) -> Fallback to Secondary (retry_always)', async () => {
      const service = new ModelAvailabilityService();
      const config = createMockConfig();
      const primaryPolicy = {
        model: 'test-model-primary',
        onTerminalError: 'prompt',
        onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE',
      };
      config.getModelPolicy.mockReturnValue(primaryPolicy);

      const onPersistent429 = vi.fn().mockResolvedValue({
        shouldRetry: true,
        model: 'test-model-fallback',
        intent: 'retry_always',
      });

      let attempt = 0;
      const apiCall = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new TerminalQuotaError('Quota exhausted', {} as any);
        }
        return 'success';
      });

      await retryWithBackoff(apiCall, {
        maxAttempts: 3,
        availability: createAvailabilityContext(
          service,
          'test-model-primary',
          primaryPolicy,
        ),
        config: config as unknown as Config,
        onPersistent429,
        authType: AuthType.LOGIN_WITH_GOOGLE,
      });

      expect(service.snapshot('test-model-primary')).toEqual({
        available: false,
        reason: 'quota',
      });
      expect(config.setActiveModel).toHaveBeenCalledWith('test-model-fallback');
      expect(apiCall).toHaveBeenCalledTimes(2);
    });

    it('Scenario B: Primary model fails with RetryableQuotaError (Capacity) -> Fallback to Secondary (retry_once)', async () => {
      const service = new ModelAvailabilityService();
      const config = createMockConfig();
      const primaryPolicy = {
        model: 'test-model-primary',
        onTransientError: 'prompt',
        onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN',
      };
      config.getModelPolicy.mockReturnValue(primaryPolicy);

      const onPersistent429 = vi.fn().mockResolvedValue({
        shouldRetry: true,
        model: 'test-model-fallback',
        intent: 'retry_once',
        restoreTo: 'test-model-primary',
      });

      let attempt = 0;
      const apiCall = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt <= 3) {
          throw new RetryableQuotaError('Capacity overloaded', {} as any, 1);
        }
        return 'success';
      });

      const promise = retryWithBackoff(apiCall, {
        maxAttempts: 3,
        initialDelayMs: 10,
        availability: createAvailabilityContext(
          service,
          'test-model-primary',
          primaryPolicy,
        ),
        config: config as unknown as Config,
        onPersistent429,
        authType: AuthType.LOGIN_WITH_GOOGLE,
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(service.snapshot('test-model-primary')).toEqual({
        available: false,
        reason: 'unavailable_for_turn',
      });
      expect(config.setActiveModel).toHaveBeenCalledWith('test-model-fallback');
      expect(config.setActiveModel).toHaveBeenLastCalledWith(
        'test-model-primary',
      );
      expect(apiCall).toHaveBeenCalledTimes(4);
    });

    it('Scenario C: 429 with "Stop" intent (No automatic failover)', async () => {
      const service = new ModelAvailabilityService();
      const config = createMockConfig();
      const primaryPolicy = {
        model: 'test-model-primary',
        onTransientError: 'prompt',
        onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN',
      };
      config.getModelPolicy.mockReturnValue(primaryPolicy);

      const onPersistent429 = vi.fn().mockResolvedValue({
        shouldRetry: false,
        intent: 'stop',
      });

      const error = new RetryableQuotaError(
        'Capacity overloaded',
        {} as any,
        1,
      );
      const apiCall = vi.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(apiCall, {
        maxAttempts: 3,
        initialDelayMs: 10,
        availability: createAvailabilityContext(
          service,
          'test-model-primary',
          primaryPolicy,
        ),
        config: config as unknown as Config,
        onPersistent429,
        authType: AuthType.LOGIN_WITH_GOOGLE,
      });

      // Capture the rejection promise before advancing timers
      const expectation =
        await expect(promise).rejects.toThrow(RetryableQuotaError);

      await vi.runAllTimersAsync();
      await expectation;

      expect(service.snapshot('test-model-primary')).toEqual({
        available: false,
        reason: 'unavailable_for_turn',
      });
    });

    it('Scenario D: Nested Fallback - Primary (retry_once) -> Secondary (fails) -> Tertiary', async () => {
      const service = new ModelAvailabilityService();
      const config = createMockConfig();
      const primaryPolicy = { model: 'test-model-primary' };

      config.getModelPolicy.mockImplementation((model) => ({ model }));

      const fallbackOutcome1: FallbackHandlerOutcome = {
        shouldRetry: true,
        model: 'test-model-secondary',
        intent: 'retry_once',
        restoreTo: 'test-model-primary',
      };

      const fallbackOutcome2: FallbackHandlerOutcome = {
        shouldRetry: true,
        model: 'test-model-tertiary',
        intent: 'retry_always',
      };

      let callCount = 0;
      let modelAtFallback2 = '';

      const onPersistent429 = vi
        .fn()
        .mockImplementation(async (auth, error, failedModel) => {
          callCount++;
          if (callCount === 1) {
            return fallbackOutcome1;
          }
          if (callCount === 2) {
            modelAtFallback2 = failedModel;
            return fallbackOutcome2;
          }
          return null;
        });

      let attempt = 0;
      const apiCall = vi.fn().mockImplementation(async () => {
        attempt++;
        // Attempt 1-3: Primary fails (Capacity)
        if (attempt <= 3) {
          throw new RetryableQuotaError('Primary Capacity', {} as any, 1);
        }
        // Attempt 4: Secondary fails (Quota)
        if (attempt === 4) {
          throw new TerminalQuotaError('Secondary Quota', {} as any);
        }
        // Attempt 5: Tertiary succeeds
        return 'success';
      });

      const promise = retryWithBackoff(apiCall, {
        maxAttempts: 3,
        initialDelayMs: 10,
        availability: createAvailabilityContext(
          service,
          'test-model-primary',
          primaryPolicy,
        ),
        config: config as unknown as Config,
        onPersistent429,
        authType: AuthType.LOGIN_WITH_GOOGLE,
      });

      await vi.runAllTimersAsync();
      await promise;

      // Verify sequence
      // 1. Primary -> Secondary
      expect(config.setActiveModel).toHaveBeenCalledWith(
        'test-model-secondary',
      );

      // 2. Secondary -> Tertiary
      expect(config.setActiveModel).toHaveBeenCalledWith('test-model-tertiary');

      // 3. CRITICAL CHECK: Did we identify the failed model correctly?
      expect(modelAtFallback2).toBe('test-model-secondary');
    });
  });
});
