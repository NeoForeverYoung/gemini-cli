/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionsService } from './ExtensionsService';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@google/gemini-cli/dist/src/config/extensions/storage.js', () => ({
  ExtensionStorage: {
    getUserExtensionsDir: vi.fn(() => '/mock/extensions'),
  },
}));

vi.mock('node:fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      promises: {
        readdir: vi.fn(),
        stat: vi.fn(),
        readFile: vi.fn(),
      },
    },
    existsSync: vi.fn(),
    promises: {
      readdir: vi.fn(),
      stat: vi.fn(),
      readFile: vi.fn(),
    },
  };
});

describe('ExtensionsService', () => {
  let extensionsService: ExtensionsService;

  beforeEach(() => {
    extensionsService = new ExtensionsService();
    vi.clearAllMocks();
  });

  it('returns empty list if extensions dir does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await extensionsService.getInstalledExtensions();
    expect(result).toEqual([]);
  });

  it('parses installed extensions correctly', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readdir).mockResolvedValue(['ext-1', 'ext-2'] as any);
    
    vi.mocked(fs.promises.stat).mockImplementation(async (path) => {
      return { isDirectory: () => true } as any;
    });

    vi.mocked(fs.promises.readFile).mockImplementation(async (filePath) => {
      if (filePath.toString().includes('ext-1')) {
        return JSON.stringify({
          name: 'my-extension',
          version: '1.0.0',
          description: 'A test extension',
        });
      } else {
        return JSON.stringify({
          name: 'other-extension',
          version: '2.0.0',
        }); // No description
      }
    });

    const result = await extensionsService.getInstalledExtensions();

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      name: 'my-extension',
      version: '1.0.0',
      description: 'A test extension',
      path: path.join('/mock/extensions', 'ext-1'),
    });
    expect(result).toContainEqual({
      name: 'other-extension',
      version: '2.0.0',
      description: undefined,
      path: path.join('/mock/extensions', 'ext-2'),
    });
  });
});
