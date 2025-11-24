/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerIpcHandlers } from './ipc-handlers';
import { join } from 'node:path';
import type { WindowManager } from '../managers/window-manager';

// Mocks
const mockIpcMain = vi.hoisted(() => ({
  on: vi.fn(),
  handle: vi.fn(),
}));
const mockDialog = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  dialog: mockDialog,
}));

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn(() => '/home/user'),
    default: {
      ...actual,
      homedir: vi.fn(() => '/home/user'),
    },
  };
});

vi.mock('@google/gemini-cli/dist/src/config/settings.js', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    merged: {},
    forScope: vi.fn().mockReturnValue({
      path: '/mock/settings.json',
      settings: {},
    }),
  }),
  saveSettings: vi.fn(),
  SettingScope: { User: 'User', System: 'System', Workspace: 'Workspace' },
}));

vi.mock('@google/gemini-cli/dist/src/config/settingsSchema.js', () => ({
  getSettingsSchema: vi.fn().mockReturnValue({
    'test.string': { type: 'string' },
    'test.number': { type: 'number' },
    'test.object': {
      type: 'object',
      properties: {
        nested: { type: 'boolean' },
      },
    },
  }),
}));

const mockWindowManager = {
  getPtyManager: vi.fn(),
  getMainWindow: vi.fn(),
  getThemeFromSettings: vi.fn(),
} as unknown as WindowManager;

describe('ipc-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents path traversal in gemini-editor:resolve', async () => {
    registerIpcHandlers(mockWindowManager);

    const resolveHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'gemini-editor:resolve',
    )![1];

    // /home/user/.gemini/tmp/diff
    const DIFF_ROOT = join('/home/user', '.gemini', 'tmp', 'diff');
    const attackPath = join(DIFF_ROOT, '..', '..', 'etc', 'passwd');

    const result = await resolveHandler(null, {
      diffPath: attackPath,
      status: 'approve',
    });

    expect(result).toEqual({ success: false, error: 'Invalid diff path' });
  });

  it('prevents partial path matching in gemini-editor:resolve', async () => {
    registerIpcHandlers(mockWindowManager);

    const resolveHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'gemini-editor:resolve',
    )![1];

    const DIFF_ROOT = join('/home/user', '.gemini', 'tmp', 'diff');
    // This path starts with DIFF_ROOT but is not inside it
    const attackPath = DIFF_ROOT + '-attack';

    const result = await resolveHandler(null, {
      diffPath: attackPath,
      status: 'approve',
    });

    expect(result).toEqual({ success: false, error: 'Invalid diff path' });
  });

  it('allows valid paths in gemini-editor:resolve', async () => {
    registerIpcHandlers(mockWindowManager);

    const resolveHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'gemini-editor:resolve',
    )![1];

    const DIFF_ROOT = join('/home/user', '.gemini', 'tmp', 'diff');
    const validPath = join(DIFF_ROOT, 'some-diff');

    // Mock fs.promises.readFile to return valid meta.json
    const fs = await import('node:fs');
    vi.mocked(fs.default.promises.readFile).mockResolvedValue(
      JSON.stringify({ filePath: '/some/file.txt' }),
    );
    vi.mocked(fs.default.promises.writeFile).mockResolvedValue(undefined);

    const result = await resolveHandler(null, {
      diffPath: validPath,
      status: 'approve',
      content: 'new content',
    });

    expect(result).toEqual({ success: true });
  });

  it('handles dialog:open-directory', async () => {
    registerIpcHandlers(mockWindowManager);

    const openHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'dialog:open-directory',
    )![1];

    // Mock window manager to return a window
    vi.mocked(mockWindowManager.getMainWindow).mockReturnValue({} as any);

    // Mock dialog result
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/selected/path'],
    });

    const result = await openHandler(null);
    expect(result).toBe('/selected/path');

    // Test cancellation
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const resultCanceled = await openHandler(null);
    expect(resultCanceled).toBeNull();
  });

  it('resolves paths in settings:get', async () => {
    registerIpcHandlers(mockWindowManager);

    const { loadSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    vi.mocked(loadSettings).mockResolvedValueOnce({
      merged: {
        terminalCwd: '~/Documents',
        context: {
          includeDirectories: ['../project', '/absolute/path'],
        },
      },
      forScope: vi.fn().mockReturnValue({
        path: '/mock/settings.json',
        settings: {},
      }),
    } as any);

    const getHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'settings:get',
    )![1];

    const result = await getHandler(null);
    const merged = result.merged;

    expect(merged.terminalCwd).toBe('/home/user/Documents');
    expect(merged.context.includeDirectories).toEqual([
      '/home/project', // Resolved relative to homedir
      '/absolute/path',
    ]);
  });

  it('validates settings types in settings:set', async () => {
    registerIpcHandlers(mockWindowManager);

    const setHandler = mockIpcMain.handle.mock.calls.find(
      (call) => call[0] === 'settings:set',
    )![1];

    // Invalid string
    const result1 = await setHandler(null, {
      changes: { 'test.string': 123 },
    });
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('Invalid type for test.string');

    // Invalid number
    const result2 = await setHandler(null, {
      changes: { 'test.number': 'not a number' },
    });
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Invalid type for test.number');

    // Invalid nested object
    const result3 = await setHandler(null, {
      changes: { 'test.object': { nested: 'not a boolean' } },
    });
    expect(result3.success).toBe(false);
    expect(result3.error).toContain('Invalid type for test.object.nested');

    // Valid settings
    const result4 = await setHandler(null, {
      changes: {
        'test.string': 'valid',
        'test.number': 123,
        'test.object': { nested: true },
      },
    });
    expect(result4).toEqual({ success: true });
  });
});
