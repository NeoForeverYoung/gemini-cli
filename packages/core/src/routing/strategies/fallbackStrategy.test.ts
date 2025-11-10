/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { FallbackStrategy } from './fallbackStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { Config } from '../../config/config.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../../config/models.js';

describe('FallbackStrategy', () => {
  const strategy = new FallbackStrategy();
  const mockContext = {} as RoutingContext;
  const mockClient = {} as BaseLlmClient;

  it('returns null when active model matches preferred', async () => {
    const mockConfig = {
      getModel: () => DEFAULT_GEMINI_MODEL,
      getActiveModel: () => DEFAULT_GEMINI_MODEL,
    } as Config;

    const decision = await strategy.route(mockContext, mockConfig, mockClient);
    expect(decision).toBeNull();
  });

  it('returns active model when it differs from preferred', async () => {
    const mockConfig = {
      getModel: () => DEFAULT_GEMINI_MODEL,
      getActiveModel: () => DEFAULT_GEMINI_FLASH_MODEL,
    } as Config;

    const decision = await strategy.route(mockContext, mockConfig, mockClient);

    expect(decision).not.toBeNull();
    expect(decision?.model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    expect(decision?.metadata.source).toBe('fallback');
    expect(decision?.metadata.reasoning).toContain('fallback');
  });
});
