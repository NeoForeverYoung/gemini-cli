/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionService } from './SessionService';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('node:fs/promises');
vi.mock('node:os');

describe('SessionService', () => {
  let sessionService: SessionService;
  const mockHomeDir = '/mock/home';
  const mockTempDir = path.join(mockHomeDir, '.gemini', 'tmp');

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
    sessionService = new SessionService();
    vi.clearAllMocks();
  });

  it('returns empty list if temp dir is empty', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([]);
    const sessions = await sessionService.getRecentSessions();
    expect(sessions).toEqual([]);
  });

  it('parses sessions correctly', async () => {
    const hash = 'hash123';
    const projectDir = path.join(mockTempDir, hash);
    const checkpointFile = 'checkpoint-tag1.json';
    const checkpointPath = path.join(projectDir, checkpointFile);
    const mtime = new Date('2023-01-01T12:00:00Z');

    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([hash] as any) // project hashes
      .mockResolvedValueOnce([checkpointFile] as any); // files in project dir

    vi.mocked(fs.stat).mockImplementation(async (p) => {
      if (p === projectDir) return { isDirectory: () => true } as any;
      if (p === checkpointPath) return { mtime } as any;
      throw new Error('File not found');
    });

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify([
        {
          role: 'user',
          parts: [
            {
              text: "I'm currently working in the directory: /path/to/project",
            },
          ],
        },
      ]),
    );

    const sessions = await sessionService.getRecentSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      tag: 'tag1',
      projectPath: '/path/to/project',
      mtime: mtime.toISOString(),
      hash,
    });
  });

  it('handles unknown project path', async () => {
    const hash = 'hash456';
    const projectDir = path.join(mockTempDir, hash);
    const checkpointFile = 'checkpoint-tag2.json';
    const checkpointPath = path.join(projectDir, checkpointFile);
    const mtime = new Date('2023-01-02T12:00:00Z');

    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([hash] as any)
      .mockResolvedValueOnce([checkpointFile] as any);

    vi.mocked(fs.stat).mockImplementation(async (p) => {
      if (p === projectDir) return { isDirectory: () => true } as any;
      if (p === checkpointPath) return { mtime } as any;
      throw new Error('File not found');
    });

    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify([{ role: 'user', parts: [{ text: 'Hello' }] }]),
    );

    const sessions = await sessionService.getRecentSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].projectPath).toBe('Unknown Project');
  });
});
