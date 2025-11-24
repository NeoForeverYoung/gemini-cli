/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTerminal } from './useTerminal';
import type { XtermTheme } from '../types/global';

// Mock xterm
const mockTerminalOpen = vi.fn();
const mockTerminalDispose = vi.fn();
const mockTerminalWrite = vi.fn();
const mockTerminalClear = vi.fn();
const mockTerminalFocus = vi.fn();
const mockTerminalOnKey = vi.fn();
const mockTerminalLoadAddon = vi.fn();
const mockAttachCustomWheelEventHandler = vi.fn();
const mockTerminalOptions = { theme: {} };

const mockBuffer = {
  active: {
    type: 'normal',
  },
};

vi.mock('@xterm/xterm', () => {
  return {
    Terminal: vi.fn().mockImplementation(() => ({
      open: mockTerminalOpen,
      dispose: mockTerminalDispose,
      write: mockTerminalWrite,
      clear: mockTerminalClear,
      focus: mockTerminalFocus,
      onKey: mockTerminalOnKey,
      loadAddon: mockTerminalLoadAddon,
      attachCustomWheelEventHandler: mockAttachCustomWheelEventHandler,
      options: mockTerminalOptions,
      buffer: mockBuffer,
    })),
  };
});

vi.mock('@xterm/addon-fit', () => {
  return {
    FitAddon: vi.fn().mockImplementation(() => ({
      fit: vi.fn(),
      proposeDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
    })),
  };
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('useTerminal', () => {
  const mockContainerRef = { current: document.createElement('div') };
  const mockTheme: XtermTheme = {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffffff',
    selectionBackground: '#444444',
    black: '#000000',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffff00',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff',
    brightBlack: '#808080',
    brightRed: '#ff0000',
    brightGreen: '#00ff00',
    brightYellow: '#ffff00',
    brightBlue: '#0000ff',
    brightMagenta: '#ff00ff',
    brightCyan: '#00ffff',
    brightWhite: '#ffffff',
  };

  const mockSendKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.electron = {
      terminal: {
        onData: vi.fn(() => vi.fn()),
        sendKey: mockSendKey,
        resize: vi.fn(),
        onReset: vi.fn(() => vi.fn()),
        onReady: vi.fn(() => vi.fn()),
        sendInput: vi.fn(),
      },
      onMainWindowResize: vi.fn(() => vi.fn()),
      // ... other mocks if needed
    } as any;
    mockBuffer.active.type = 'normal';
  });

  it('should initialize terminal', () => {
    renderHook(() => useTerminal(mockContainerRef, mockTheme));
    expect(mockTerminalOpen).toHaveBeenCalledWith(mockContainerRef.current);
    expect(mockAttachCustomWheelEventHandler).toHaveBeenCalled();
  });

  it('should handle mouse wheel in alternate buffer', () => {
    renderHook(() => useTerminal(mockContainerRef, mockTheme));

    // Get the registered handler
    const handler = mockAttachCustomWheelEventHandler.mock.calls[0][0];

    // Simulate alternate buffer
    mockBuffer.active.type = 'alternate';

    // Simulate wheel down
    const wheelEventDown = { deltaY: 100 } as WheelEvent;
    const resultDown = handler(wheelEventDown);

    // Check if sendKey was called with Shift + Arrow Down (\x1b[1;2B)
    // Threshold is 20. 100 / 20 = 5 times.
    expect(mockSendKey).toHaveBeenCalledTimes(5);
    expect(mockSendKey).toHaveBeenCalledWith('\x1b[1;2B');
    expect(resultDown).toBe(false); // Should prevent default

    mockSendKey.mockClear();

    // Simulate wheel up
    const wheelEventUp = { deltaY: -100 } as WheelEvent;
    const resultUp = handler(wheelEventUp);

    // Check if sendKey was called with Shift + Arrow Up (\x1b[1;2A)
    expect(mockSendKey).toHaveBeenCalledTimes(5);
    expect(mockSendKey).toHaveBeenCalledWith('\x1b[1;2A');
    expect(resultUp).toBe(false); // Should prevent default
  });

  it('should NOT handle mouse wheel in normal buffer', () => {
    renderHook(() => useTerminal(mockContainerRef, mockTheme));

    const handler = mockAttachCustomWheelEventHandler.mock.calls[0][0];

    // Simulate normal buffer
    mockBuffer.active.type = 'normal';

    const wheelEvent = { deltaY: 100 } as WheelEvent;
    const result = handler(wheelEvent);

    expect(mockSendKey).not.toHaveBeenCalled();
    expect(result).toBe(true); // Should allow default
  });
});
