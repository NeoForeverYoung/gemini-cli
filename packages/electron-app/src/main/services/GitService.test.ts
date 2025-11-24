/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitService } from './GitService';
import { WindowManager } from '../managers/window-manager';
import { BrowserWindow } from 'electron';
import { exec } from 'child_process';

vi.mock('child_process', () => {
  const execMock = vi.fn();
  const execFileMock = vi.fn();
  return {
    __esModule: true,
    exec: execMock,
    execFile: execFileMock,
    default: { exec: execMock, execFile: execFileMock },
  };
});

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
    })),
  },
}));

describe('GitService', () => {
  let gitService: GitService;
  let mockWindowManager: WindowManager;
  let mockMainWindow: BrowserWindow;
  let mockWebContents: any;

  beforeEach(() => {
    mockWebContents = {
      send: vi.fn(),
    };
    mockMainWindow = {
      webContents: mockWebContents,
    } as unknown as BrowserWindow;
    mockWindowManager = {
      getMainWindow: vi.fn(() => mockMainWindow),
    } as unknown as WindowManager;

    gitService = new GitService(mockWindowManager);
    vi.clearAllMocks();
  });

  it('parses git output correctly', async () => {
    const numstat = '10\t0\tfile1.ts\n0\t5\tfile2.ts';
    const porcelain = 'M  file1.ts\n D file2.ts\n?? file3.ts';

    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd, opts, cb) => {
        if (cmd.includes('rev-parse')) {
          cb(null, { stdout: 'true' });
        } else if (cmd.includes('numstat')) {
          cb(null, { stdout: numstat });
        } else if (cmd.includes('porcelain')) {
          cb(null, { stdout: porcelain });
        }
      },
    );

    await gitService.updateStatus('/path/to/repo');

    expect(mockWebContents.send).toHaveBeenCalledWith('git:status-update', {
      path: '/path/to/repo',
      totalAdded: 10,
      totalDeleted: 5,
      files: [
        {
          path: 'file1.ts',
          added: 10,
          deleted: 0,
          status: 'M',
          stagedStatus: 'M',
          unstagedStatus: ' ',
        },
        {
          path: 'file2.ts',
          added: 0,
          deleted: 5,
          status: 'D',
          stagedStatus: ' ',
          unstagedStatus: 'D',
        },
        {
          path: 'file3.ts',
          added: 0,
          deleted: 0,
          status: '??',
          stagedStatus: '?',
          unstagedStatus: '?',
        },
      ],
    });
  });
});
