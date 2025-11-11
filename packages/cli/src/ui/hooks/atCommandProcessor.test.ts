/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import type { Config } from '@google/gemini-cli-core';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

describe('handleAtCommand', () => {
  let mockConfig: Config;
  const mockAddItem: Mock<UseHistoryManagerReturn['addItem']> = vi.fn();
  const mockOnDebugMessage: Mock<(message: string) => void> = vi.fn();
  let abortController: AbortController;

  beforeEach(() => {
    vi.resetAllMocks();
    abortController = new AbortController();
    mockConfig = {} as unknown as Config; // Config is not used anymore
  });

  it('should pass through query unmodified', async () => {
    const query = 'regular user query with @some/path';

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 123,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [{ text: query }],
      shouldProceed: true,
    });
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(mockOnDebugMessage).not.toHaveBeenCalled();
  });
});
