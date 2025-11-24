/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { dialog } from 'electron';
import type { IPty, IDisposable } from 'node-pty';
import { getPty } from '@google/gemini-cli-core';
import os from 'node:os';
import fs from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { watch, type FSWatcher } from 'chokidar';
import type { CliSettings } from '../config/types';
import { CLI_PATH } from '../config/paths';
import log from '../utils/logger';

async function waitForFileStability(
  filePath: string,
  maxRetries = 40,
  intervalMs = 250,
  stabilityWindowMs = 500,
): Promise<void> {
  let lastMtime = 0;
  let lastSize = -1;
  let stableSince = 0;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs === lastMtime && stats.size === lastSize) {
        if (stableSince === 0) {
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= stabilityWindowMs) {
          return; // Stable
        }
      } else {
        lastMtime = stats.mtimeMs;
        lastSize = stats.size;
        stableSince = 0;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // If file doesn't exist yet, we keep waiting
      stableSince = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    retries++;
  }
  throw new Error(
    `Timeout waiting for file stability after ${maxRetries} attempts: ${filePath}`,
  );
}

export class PtyManager {
  private sessions = new Map<
    string,
    {
      process: IPty;
      onData: IDisposable;
      buffer: string;
    }
  >();
  private fileWatcher: FSWatcher | null = null;
  private sessionPromises = new Map<string, Promise<void>>();

  constructor(private mainWindow: BrowserWindow) {}

  async start(
    sessionId: string,
    cwd?: string,
    cols: number,
    rows: number,
    shouldResume = true,
    retryCount = 0,
  ): Promise<void> {
    // If a start operation is already in progress for this session, wait for it
    if (this.sessionPromises.has(sessionId)) {
      await this.sessionPromises.get(sessionId);
      // After waiting, fall through to the re-attach logic if the session was created
    }

    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      log.info(`[PTY] Restarting session: ${sessionId}`);
      const session = this.sessions.get(sessionId)!;
      
      // Kill the existing process asynchronously (don't block)
      this.sessions.delete(sessionId);
      
      try {
        session.onData.dispose();
        session.process.kill();
      } catch (e) {
        log.warn(`[PTY] Failed to kill existing session ${sessionId}:`, e);
      }
    }

    // Start new session logic wrapped in a promise
    const startPromise = (async () => {
      try {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
          return;
        }

        // Clean up file watcher if it's a completely new start (optional, maybe we keep it?)
        // For now, we keep one file watcher for the app lifetime or check if we need to restart it
        if (!this.fileWatcher) {
          await this.setupFileWatcher();
        }

        log.info(
          `[PTY] Starting new PTY process for session ${sessionId} with CLI path: ${CLI_PATH}`,
        );

        if (!fs.existsSync(CLI_PATH)) {
          const errorMsg = `[PTY] CLI path not found: ${CLI_PATH}`;
          log.error(errorMsg);
          dialog.showErrorBox('Fatal Error', errorMsg);
          return;
        }

        const terminalCwd = cwd || (await this.getTerminalCwd());
        const env = await this.getEnv();

        const ptyInfo = await getPty();
        if (!ptyInfo) {
          throw new Error('Failed to load PTY implementation');
        }

        const command = process.platform === 'win32' ? 'node.exe' : 'node';
        const args = [CLI_PATH];
        if (sessionId && shouldResume) {
          args.push('--resume', sessionId);
        }

        const ptyProcess = ptyInfo.module.spawn(command, args, {
          name: 'xterm-color',
          cols,
          rows,
          cwd: terminalCwd,
          env: {
            ...process.env,
            ...env,
            ELECTRON_RUN_AS_NODE: '1',
            GEMINI_CLI_CONTEXT: 'electron',
            GEMINI_SESSION_ID: sessionId,
            NODE_NO_WARNINGS: '1',
            DEV: 'false',
          },
        }) as IPty;

        log.info(`[PTY] Spawned process for session ${sessionId}, PID: ${ptyProcess.pid}`);

        const MAX_BUFFER_SIZE = 100 * 1024; // 100KB buffer for history restoration

        const onDataDisposable = ptyProcess.onData((data) => {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.buffer += data;
            if (session.buffer.length > MAX_BUFFER_SIZE) {
              session.buffer = session.buffer.substring(
                session.buffer.length - MAX_BUFFER_SIZE,
              );
            }

            if (!this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('terminal.incomingData', {
                sessionId,
                data,
              });
            }
          }
        });

        this.sessions.set(sessionId, {
          process: ptyProcess,
          onData: onDataDisposable,
          buffer: '',
        });

        if (!this.mainWindow.isDestroyed()) {
          // We might need to signal readiness for this specific session?
          // For now, frontend assumes ready if start resolves or data comes.
          this.mainWindow.webContents.send('terminal.ready', { sessionId });
        }

        ptyProcess.onExit(({ exitCode, signal }) => {
          // Check if session is still active (wasn't removed by restart logic)
          if (!this.sessions.has(sessionId)) {
            return;
          }
          
          const session = this.sessions.get(sessionId)!;
          // Only cleanup if the process actually exited (not just replaced)
          if (session.process === ptyProcess) {
            session.onData.dispose();
            this.sessions.delete(sessionId);
          }

          const signalMsg = signal ? ` and signal ${signal}` : '';
          log.info(
            `[PTY] Process for session ${sessionId} exited with code ${exitCode}${signalMsg}`,
          );

          if (exitCode !== 0) {
            // Optional: notify user
          } else {
            if (!this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('terminal.incomingData', {
                sessionId,
                data: '\r\n[Process completed]\r\n',
              });
            }
          }
        });
      } catch (e) {
        const error = e as Error;
        log.error(
          `[PTY] Failed to start PTY process (attempt ${retryCount + 1}):`,
          error,
        );

        if (retryCount < 3) {
          setTimeout(
            () => this.start(sessionId, cwd, cols, rows, shouldResume, retryCount + 1),
            1000 * (retryCount + 1),
          );
          return;
        }

        dialog.showErrorBox(
          'Failed to Start PTY Process',
          `Message: ${error.message}\nStack: ${error.stack}`,
        );
      } finally {
        this.sessionPromises.delete(sessionId);
      }
    })();

    this.sessionPromises.set(sessionId, startPromise);
    return startPromise;
  }

  resize(sessionId: string, cols: number, rows: number) {
    if (this.sessions.has(sessionId)) {
      try {
        this.sessions.get(sessionId)!.process.resize(cols, rows);
      } catch (error) {
        log.warn(`[PTY] Failed to resize PTY for session ${sessionId}:`, error);
      }
    }
  }

  write(sessionId: string, data: string) {
    if (this.sessions.has(sessionId)) {
      try {
        this.sessions.get(sessionId)!.process.write(data);
      } catch (error) {
        log.warn(`[PTY] Failed to write to PTY for session ${sessionId}:`, error);
      }
    } else {
      log.warn(`[PTY] Cannot write, no session ${sessionId}`);
      // Notify frontend that session is missing so it can trigger a restart/reload
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('terminal.notFound', { sessionId });
      }
    }
  }

  async dispose() {
    for (const [id, session] of this.sessions) {
      try {
        session.onData.dispose();
        log.info(`[PTY] Killing process for session ${id}, PID: ${session.process.pid}`);
        session.process.kill();
      } catch (e) {
        log.warn(`[PTY] Failed to dispose session ${id}:`, e);
      }
    }
    this.sessions.clear();

    // Give processes a moment to actually die
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }

  private async getTerminalCwd() {
    const { loadSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    const { merged } = await loadSettings(os.homedir());
    const settings = merged as CliSettings;
    if (settings.terminalCwd && typeof settings.terminalCwd === 'string') {
      return settings.terminalCwd;
    }
    return join(os.homedir(), 'Documents');
  }

  private async getEnv() {
    const { loadSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    const { merged } = await loadSettings(os.homedir());
    const settings = merged as CliSettings;

    const env: Record<string, string> = {};
    if (typeof settings.env === 'string') {
      for (const line of settings.env.split('\n')) {
        const parts = line.split('=');
        const key = parts.shift();
        const value = parts.join('=');
        if (key) {
          env[key] = value;
        }
      }
    }
    return env;
  }

  private async setupFileWatcher() {
    const diffDir = join(os.homedir(), '.gemini', 'tmp', 'diff');
    try {
      await fs.promises.mkdir(diffDir, { recursive: true });
    } catch (e) {
      log.error('Error creating diff directory:', e);
      return;
    }

    if (this.fileWatcher) {
      await this.fileWatcher.close();
    }

    this.fileWatcher = watch(diffDir, {
      ignoreInitial: true,
      depth: 2,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.fileWatcher.on('add', async (filePath: string) => {
      if (basename(filePath) === 'meta.json') {
        const fullPath = dirname(filePath);
        const responsePath = join(fullPath, 'response.json');

        try {
          if (fs.existsSync(responsePath)) {
            return;
          }

          // meta.json is stable due to awaitWriteFinish

          const meta = JSON.parse(
            await fs.promises.readFile(filePath, 'utf-8'),
          );
          const fileType = extname(meta.filePath);

          const oldPath = join(fullPath, `old${fileType}`);
          const newPath = join(fullPath, `new${fileType}`);

          // Wait for old and new files to be stable.
          // We still need this because they might be written after meta.json,
          // and we need to ensure they are fully written before reading.
          // awaitWriteFinish only delays their 'add' events, but we are
          // processing them here based on meta.json's 'add' event.
          await Promise.all([
            waitForFileStability(oldPath),
            waitForFileStability(newPath),
          ]);

          if (!fs.existsSync(oldPath) || !fs.existsSync(newPath)) {
            log.warn(`Missing old or new file in ${fullPath}`);
            return;
          }

          const oldContent = await fs.promises.readFile(oldPath, 'utf-8');
          const newContent = await fs.promises.readFile(newPath, 'utf-8');

          if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('gemini-editor:show', {
              diffPath: fullPath,
              filePath: meta.filePath,
              oldContent,
              newContent,
              meta,
            });
          }
        } catch (e) {
          log.error('Error processing new diff:', e);
        }
      }
    });
  }
}
