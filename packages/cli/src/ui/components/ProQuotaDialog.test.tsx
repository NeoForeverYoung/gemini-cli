/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ProQuotaDialog } from './ProQuotaDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { ResolvedModelRecommendation } from '../contexts/UIStateContext.js';

// Mock the child component to make it easier to test the parent
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

describe('ProQuotaDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with correct title and options', () => {
    const recommendation: ResolvedModelRecommendation = {
      selected: 'gemini-2.5-flash',
      skipped: [],
      action: 'prompt',
      failureKind: 'terminal',
    };
    const { lastFrame, unmount } = render(
      <ProQuotaDialog
        failedModel="gemini-2.5-pro"
        recommendation={recommendation}
        title="Quota limit reached for gemini-2.5-pro"
        choices={[
          { label: 'Try again later', intent: 'stop', key: 'stop' },
          {
            label: 'Switch to gemini-2.5-flash for the rest of this session',
            intent: 'retry_always',
            key: 'always',
          },
        ]}
        onChoice={() => {}}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Quota limit reached for gemini-2.5-pro');
    expect(output).toContain('gemini-2.5-pro → gemini-2.5-flash');

    // Check that RadioButtonSelect was called with the correct items
    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            label: 'Try again later',
            value: 'stop',
            key: 'stop',
          },
          {
            label: 'Switch to gemini-2.5-flash for the rest of this session',
            value: 'retry_always',
            key: 'always',
          },
        ],
      }),
      undefined,
    );
    unmount();
  });

  it('should call onChoice with the selected intent', () => {
    const mockOnChoice = vi.fn();
    const recommendation: ResolvedModelRecommendation = {
      selected: 'gemini-2.5-flash',
      skipped: [],
      action: 'prompt',
      failureKind: 'terminal',
    };
    const { unmount } = render(
      <ProQuotaDialog
        failedModel="gemini-2.5-pro"
        recommendation={recommendation}
        title="Quota limit reached for gemini-2.5-pro"
        choices={[
          { label: 'Try again later', intent: 'stop', key: 'stop' },
          {
            label: 'Switch to gemini-2.5-flash for the rest of this session',
            intent: 'retry_always',
            key: 'always',
          },
        ]}
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    act(() => {
      onSelect('retry_always');
    });

    expect(mockOnChoice).toHaveBeenCalledWith('retry_always');
    unmount();
  });
});
