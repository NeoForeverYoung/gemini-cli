/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ModelAvailabilityService } from './modelAvailabilityService.js';

describe('ModelAvailabilityService', () => {
  let service: ModelAvailabilityService;
  const model = 'gemini-2.5-pro';

  beforeEach(() => {
    service = new ModelAvailabilityService();
    vi.useRealTimers();
  });

  it('returns available snapshot when no state recorded', () => {
    expect(service.snapshot(model)).toEqual({ available: true });
  });

  it('tracks retryable failures as unavailable for the current turn', () => {
    service.markUnavailableForTurn(model);

    expect(service.snapshot(model)).toEqual({
      available: false,
      reason: 'unavailable_for_turn',
    });

    service.resetTurn();
    expect(service.snapshot(model)).toEqual({ available: true });
  });

  it('tracks terminal failures', () => {
    service.markTerminal(model, 'quota');
    expect(service.snapshot(model)).toEqual({
      available: false,
      reason: 'quota',
    });
  });

  it('maps policy-driven terminal reasons', () => {
    service.markTerminal(model, 'capacity');
    expect(service.snapshot(model)).toEqual({
      available: false,
      reason: 'capacity',
    });
  });

  it('selects first available model and reports skipped ones', () => {
    service.markTerminal(model, 'quota');
    const result = service.selectFirstAvailable([model, 'gemini-2.5-flash']);
    expect(result).toEqual({
      selected: 'gemini-2.5-flash',
      skipped: [
        {
          model,
          reason: 'quota',
          nextRetryAt: undefined,
        },
      ],
    });
  });

  it('emits events when health changes', () => {
    const listener = vi.fn();
    service.on('healthChanged', listener);

    service.markUnavailableForTurn(model);
    expect(listener).toHaveBeenCalledWith(model, {
      available: false,
      reason: 'unavailable_for_turn',
    });

    service.resetTurn();
    expect(listener).toHaveBeenLastCalledWith(model, { available: true });
  });
});
