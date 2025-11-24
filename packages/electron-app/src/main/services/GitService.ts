/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execFile } from 'child_process';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { WindowManager } from '../managers/window-manager';
import { WorkspaceGitStatus, GitFileStatus } from '../../types/git';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export class GitService {
  private watchers = new Map<string, chokidar.FSWatcher>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private isUpdating = new Map<string, boolean>();
  private pendingUpdate = new Map<string, boolean>();

  constructor(private windowManager: WindowManager) {
    // this.checkGitEnvironment();
  }

  // private async checkGitEnvironment() { ... } - Method removed or commented out to clean up code


  async watch(paths: string[]) {
    // Remove watchers for paths not in the list
    const closePromises: Promise<void>[] = [];
    for (const [watchedPath, watcher] of this.watchers) {
      if (!paths.includes(watchedPath)) {
        closePromises.push(watcher.close());
        this.watchers.delete(watchedPath);
      }
    }
    await Promise.all(closePromises);

    // Add new watchers
    for (const p of paths) {
      if (!this.watchers.has(p)) {
        this.startWatcher(p);
        // Initial update
        this.updateStatus(p);
      }
    }
  }

  private startWatcher(cwd: string) {
    const watcher = chokidar.watch(cwd, {
      ignored: [
        /(^|[\\/])\..*/, // dotfiles
        /node_modules/,
        /\.git/,
        '**/dist/**',
        '**/out/**',
        '**/build/**',
      ],
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on('all', () => {
      this.debouncedUpdate(cwd);
    });

    this.watchers.set(cwd, watcher);
  }

  private debouncedUpdate(cwd: string) {
    if (this.debounceTimers.has(cwd)) {
      clearTimeout(this.debounceTimers.get(cwd));
    }
    const timer = setTimeout(() => {
      this.updateStatus(cwd);
      this.debounceTimers.delete(cwd);
    }, 500);
    this.debounceTimers.set(cwd, timer);
  }

  async updateStatus(cwd: string) {
    // If an update is already running, mark a pending update and return
    if (this.isUpdating.get(cwd)) {
      this.pendingUpdate.set(cwd, true);
      return;
    }

    this.isUpdating.set(cwd, true);
    const mainWindow = this.windowManager.getMainWindow();
    if (!mainWindow) {
      this.isUpdating.set(cwd, false);
      return;
    }

    try {
      // Run in parallel to reduce total latency.
      // Use GIT_OPTIONAL_LOCKS=0 to prevent waiting for the index lock.
      // Use -z for machine-readable, null-terminated output.
      // Using execAsync (shell) for all commands to ensure correct environment inheritance.
      const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' };
      
      const [numstat, porcelain, branch] = await Promise.all([
        execAsync('git diff HEAD --numstat', { cwd, env }).catch(() => ({
          stdout: '',
        })),
        execAsync('git status --porcelain -z', { cwd, env }).catch(() => ({
          stdout: '',
        })),
        execAsync('git branch --show-current', { cwd, env }).catch(() => ({
          stdout: '',
        })),
      ]);

      const status = this.parseGitOutput(cwd, numstat.stdout, porcelain.stdout);
      status.branch = branch.stdout.trim();

      mainWindow.webContents.send('git:status-update', status);
    } catch (error) {
      console.error(`Failed to update git status for ${cwd}:`, error);
    } finally {
      this.isUpdating.set(cwd, false);
      // If a pending update was requested while we were running, trigger it now
      if (this.pendingUpdate.get(cwd)) {
        this.pendingUpdate.set(cwd, false);
        this.debouncedUpdate(cwd);
      }
    }
  }

  async getHistory(cwd: string, limit = 20): Promise<GitCommit[]> {
    try {
      // Check if git repo
      try {
        await execAsync('git rev-parse --is-inside-work-tree', { cwd });
      } catch {
        return [];
      }

      // Format: hash|author|date|message
      const { stdout } = await execAsync(
        `git log -n ${limit} --pretty=format:"%h|%an|%ad|%s" --date=short`,
        { cwd },
      );

      return stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const [hash, author, date, message] = line.split('|');
          return {
            hash,
            author,
            date,
            message,
          };
        });
    } catch (error) {
      console.error(`Failed to get git history for ${cwd}:`, error);
      return [];
    }
  }

  async getFileDiff(
    cwd: string,
    filePath: string,
  ): Promise<{ oldContent: string; newContent: string }> {
    try {
      // Get old content from git (HEAD)
      let oldContent = '';
      try {
        const { stdout } = await execAsync(`git show HEAD:"${filePath}"`, {
          cwd,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });
        oldContent = stdout;
      } catch {
        // Likely a new file or not in HEAD yet
        oldContent = '';
      }

      // Get new content from file system
      let newContent = '';
      try {
        newContent = await readFile(path.join(cwd, filePath), 'utf-8');
      } catch {
        // Likely deleted
        newContent = '';
      }

      return { oldContent, newContent };
    } catch (error) {
      console.error(`Failed to get file diff for ${filePath} in ${cwd}:`, error);
      throw error;
    }
  }

  async stageFile(cwd: string, file: string) {
    try {
      // Escape double quotes for shell
      const quotedFile = `"${file.replace(/(["$`\\])/g, '\\$1')}"`;
      await execAsync(`git add ${quotedFile}`, { cwd });
      // Use debounced update to return immediately and batch rapid changes
      this.debouncedUpdate(cwd);
    } catch (error) {
      console.error(`Failed to stage file ${file} in ${cwd}:`, error);
    }
  }

  async unstageFile(cwd: string, file: string) {
    try {
      const quotedFile = `"${file.replace(/(["$`\\])/g, '\\$1')}"`;
      // Use restore --staged which works for both new and modified files and avoids HEAD issues
      await execAsync(`git restore --staged ${quotedFile}`, { cwd });
      this.debouncedUpdate(cwd);
    } catch (error) {
      console.error(`Failed to unstage file ${file} in ${cwd}:`, error);
      // Fallback for older git versions or specific edge cases
      try {
        const quotedFile = `"${file.replace(/(["$`\\])/g, '\\$1')}"`;
        await execAsync(`git reset HEAD ${quotedFile}`, { cwd });
        this.debouncedUpdate(cwd);
      } catch (fallbackError) {
        console.error(`Fallback unstage failed for ${file}:`, fallbackError);
      }
    }
  }

  async revertFile(cwd: string, file: string) {
    const quotedFile = `"${file.replace(/(["$`\\])/g, '\\$1')}"`;
    try {
      await execAsync(`git restore ${quotedFile}`, { cwd });
      this.debouncedUpdate(cwd);
    } catch (error: any) {
      const stderr = error.stderr || '';
      // If git restore fails because the file is unknown (untracked), try deleting it with git clean
      if (stderr.includes('did not match any file') || stderr.includes('pathspec')) {
        try {
          await execAsync(`git clean -f ${quotedFile}`, { cwd });
          this.debouncedUpdate(cwd);
          return;
        } catch (cleanError) {
          console.error(`Failed to clean untracked file ${file}:`, cleanError);
        }
      }

      console.error(`Failed to revert file ${file} in ${cwd}:`, error);
      // Fallback
      try {
        await execAsync(`git checkout -- ${quotedFile}`, { cwd });
        this.debouncedUpdate(cwd);
      } catch (fallbackError) {
        console.error(`Fallback revert failed for ${file}:`, fallbackError);
      }
    }
  }

  private decodeGitPath(path: string): string {
    if (path.startsWith('"') && path.endsWith('"')) {
      // Remove quotes
      path = path.slice(1, -1);
      // Decode escaped octal sequences (e.g. \342\200\257) to bytes
      const binaryStr = path.replace(/\\([0-7]{1,3})/g, (_, octal) =>
        String.fromCharCode(parseInt(octal, 8)),
      );
      // Decode standard escapes (simplified)
      const unescapedStr = binaryStr.replace(/\\["\\nt]/g, (m) => {
        switch (m) {
          case '\\"':
            return '"';
          case '\\\\':
            return '\\';
          case '\\n':
            return '\n';
          case '\\t':
            return '\t';
          default:
            return m;
        }
      });
      // Convert binary string (latin1) to UTF-8
      return Buffer.from(unescapedStr, 'binary').toString('utf8');
    }
    return path;
  }

  private parseGitOutput(
    cwd: string,
    numstat: string,
    porcelain: string,
  ): WorkspaceGitStatus {
    const filesMap = new Map<string, GitFileStatus>();

    // Parse porcelain (-z format)
    // Output is: XY PATH\0 (or XY PATH1\0PATH2\0 for renames)
    if (porcelain) {
      let i = 0;
      while (i < porcelain.length) {
        const status = porcelain.substring(i, i + 2);
        // Skip space between status and path if present (porcelain v1 usually has space, -z might not)
        // Actually `git status --porcelain -z` output is: XY<space>PATH\0
        const x = status.charAt(0);
        const y = status.charAt(1);
        
        // Path starts at i+3 (XY + space)
        let pathStart = i + 3;
        let nullIndex = porcelain.indexOf('\0', pathStart);
        
        if (nullIndex === -1) break; // Should not happen if well-formed

        let filePath = porcelain.substring(pathStart, nullIndex);
        
        // Advance index to next entry
        i = nullIndex + 1;

        // Handle renames (R) or copies (C) which have two paths: PATH1\0PATH2\0
        // In porcelain v1 -z: R  ORIG_PATH\0TARGET_PATH\0
        if (x === 'R' || x === 'C') {
           // The first path was the 'from', we need the 'to'
           const nextNull = porcelain.indexOf('\0', i);
           if (nextNull !== -1) {
             filePath = porcelain.substring(i, nextNull);
             i = nextNull + 1;
           }
        }

        let statusCode: GitFileStatus['status'] = 'M';
        if (status.includes('?')) statusCode = '??';
        else if (status.includes('A')) statusCode = 'A';
        else if (status.includes('D')) statusCode = 'D';
        else if (status.includes('R')) statusCode = 'R';
        else if (status.includes('U')) statusCode = 'U';

        filesMap.set(filePath, {
          path: filePath,
          added: 0,
          deleted: 0,
          status: statusCode,
          stagedStatus: x,
          unstagedStatus: y,
        });
      }
    }

    // Parse numstat to get counts
    const numstatLines = numstat.trim().split('\n');
    let totalAdded = 0;
    let totalDeleted = 0;

    for (const line of numstatLines) {
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const [addedStr, deletedStr, rawFilePath] = parts;
      const filePath = this.decodeGitPath(rawFilePath);

      const added = addedStr === '-' ? 0 : parseInt(addedStr, 10);
      const deleted = deletedStr === '-' ? 0 : parseInt(deletedStr, 10);

      if (filesMap.has(filePath)) {
        const file = filesMap.get(filePath)!;
        file.added = added;
        file.deleted = deleted;
        totalAdded += added;
        totalDeleted += deleted;
      } else {
        filesMap.set(filePath, {
          path: filePath,
          added,
          deleted,
          status: 'M',
          stagedStatus: ' ',
          unstagedStatus: ' ',
        });
        totalAdded += added;
        totalDeleted += deleted;
      }
    }

    return {
      path: cwd,
      totalAdded,
      totalDeleted,
      files: Array.from(filesMap.values()).sort((a, b) =>
        a.path.localeCompare(b.path),
      ),
    };
  }
}
