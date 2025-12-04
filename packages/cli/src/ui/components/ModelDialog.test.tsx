/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { cleanup } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
  GEMINI_MODEL_ALIAS_PRO,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL,
} from '@google/gemini-cli-core';
import { ModelDialog } from './ModelDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));
const mockedUseKeypress = vi.mocked(useKeypress);

vi.mock('./shared/DescriptiveRadioButtonSelect.js', () => ({
  DescriptiveRadioButtonSelect: vi.fn(() => null),
}));
const mockedSelect = vi.mocked(DescriptiveRadioButtonSelect);

const renderComponent = (
  props: Partial<React.ComponentProps<typeof ModelDialog>> = {},
  contextValue: Partial<Config> | undefined = undefined,
) => {
  const defaultProps = {
    onClose: vi.fn(),
  };
  const combinedProps = { ...defaultProps, ...props };

  const mockConfig = contextValue
    ? ({
        // --- Functions used by ModelDialog ---
        getModel: vi.fn(() => DEFAULT_GEMINI_MODEL_AUTO),
        setModel: vi.fn(),
        getPreviewFeatures: vi.fn(() => false),

        // --- Functions used by ClearcutLogger ---
        getUsageStatisticsEnabled: vi.fn(() => true),
        getSessionId: vi.fn(() => 'mock-session-id'),
        getDebugMode: vi.fn(() => false),
        getContentGeneratorConfig: vi.fn(() => ({ authType: 'mock' })),
        getUseSmartEdit: vi.fn(() => false),
        getProxy: vi.fn(() => undefined),
        isInteractive: vi.fn(() => false),
        getExperiments: () => {},

        // --- Spread test-specific overrides ---
        ...contextValue,
      } as Config)
    : undefined;

  const renderResult = render(
    <ConfigContext.Provider value={mockConfig}>
      <ModelDialog {...combinedProps} />
    </ConfigContext.Provider>,
  );

  return {
    ...renderResult,
    props: combinedProps,
    mockConfig,
  };
};

describe('<ModelDialog />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the category tabs and help text', () => {
    const { lastFrame, unmount } = renderComponent();
    expect(lastFrame()).toContain('Select Model'); // Checks header or title
    expect(lastFrame()).toContain('Auto');
    expect(lastFrame()).toContain('Manual');
    expect(lastFrame()).toContain('(Press Esc to close)');
    expect(lastFrame()).toContain(
      'To use a specific Gemini model on startup, use the --model flag.',
    );
    unmount();
  });

  it('initializes in "auto" category with auto options by default', () => {
    const { unmount } = renderComponent();
    expect(mockedSelect).toHaveBeenCalledTimes(1);

    const props = mockedSelect.mock.calls[0][0];
    expect(props.items).toHaveLength(4); // Auto has 4 options
    expect(props.items[0].value).toBe(DEFAULT_GEMINI_MODEL_AUTO);
    unmount();
  });

  it('initializes in "manual" category if current model is not in auto list', () => {
    const mockGetModel = vi.fn(() => PREVIEW_GEMINI_MODEL); // A specific manual model
    const { unmount } = renderComponent({}, { getModel: mockGetModel });

    const props = mockedSelect.mock.calls[0][0];
    // Checks if it loaded manual options. Manual has 6 options currently.
    expect(props.items).toHaveLength(6);
    expect(props.items[0].value).toBe(PREVIEW_GEMINI_MODEL);
    // It should also set initialIndex correctly
    expect(props.initialIndex).toBe(0); // PREVIEW_GEMINI_MODEL is the first one
    unmount();
  });

  it('toggles category when "right" arrow is pressed', () => {
    const { unmount } = renderComponent();

    expect(mockedUseKeypress).toHaveBeenCalled();
    const keyPressHandler = mockedUseKeypress.mock.calls[0][0];

    // Simulate Right Arrow
    act(() => {
      keyPressHandler({
        name: 'right',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        insertable: false,
        sequence: '',
      });
    });

    // Should re-render with Manual options
    expect(mockedSelect).toHaveBeenCalledTimes(2);
    const props = mockedSelect.mock.calls[1][0];
    expect(props.items).toHaveLength(6); // Manual options
    unmount();
  });

  it('toggles category when "left" arrow is pressed', () => {
    const { unmount } = renderComponent();
    // Start in auto. Switch to manual (right), then back to auto (left).
    const keyPressHandler = mockedUseKeypress.mock.calls[0][0];

    // Right -> Manual
    act(() => {
      keyPressHandler({
        name: 'right',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        insertable: false,
        sequence: '',
      });
    });

    // Left -> Auto
    act(() => {
      keyPressHandler({
        name: 'left',
        ctrl: false,
        meta: false,
        shift: false,
        paste: false,
        insertable: false,
        sequence: '',
      });
    });

    expect(mockedSelect).toHaveBeenCalledTimes(3);
    const props = mockedSelect.mock.calls[2][0];
    expect(props.items).toHaveLength(4); // Auto options
    unmount();
  });

  it('calls config.setModel and onClose when onSelect is triggered', () => {
    const { props, mockConfig, unmount } = renderComponent({}, {});

    const childOnSelect = mockedSelect.mock.calls[0][0].onSelect;
    act(() => {
      childOnSelect(GEMINI_MODEL_ALIAS_PRO);
    });

    expect(mockConfig?.setModel).toHaveBeenCalledWith(GEMINI_MODEL_ALIAS_PRO);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('calls onClose prop when "escape" key is pressed', () => {
    const { props, unmount } = renderComponent();

    const keyPressHandler = mockedUseKeypress.mock.calls[0][0];

    keyPressHandler({
      name: 'escape',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      insertable: false,
      sequence: '',
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
});
