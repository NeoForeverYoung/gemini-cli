/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StandardFileSystemService } from './fileSystemService.js';

describe('StandardFileSystemService', () => {
  let fileSystem: StandardFileSystemService;
  let tempDir: string;

  beforeEach(() => {
    vi.resetAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileSystemService-test-'));
    fileSystem = new StandardFileSystemService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readTextFile', async () => {
    it('should read file content using fs', async () => {
      const testContent = 'Hello, World!';
      const testFile = path.join(tempDir, 'file.txt');
      fs.writeFileSync(testFile, testContent);

      const result = await fileSystem.readTextFile(testFile);

      expect(result).toBe(testContent);
    });

    it('should propagate fs.readFile errors', async () => {
      await expect(
        fileSystem.readTextFile('/test/non-existent-file.txt'),
      ).rejects.toThrow('ENOENT: no such file or directory');
    });
  });

  describe('writeTextFile', () => {
    it('should write file content using fs', async () => {
      const testFile = path.join(tempDir, 'file.txt');
      await fileSystem.writeTextFile(testFile, 'Hello, World!');

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toBe('Hello, World!');
    });
  });
});
