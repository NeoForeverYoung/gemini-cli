/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, BrowserWindow, dialog } from 'electron';
import os from 'node:os';
import process from 'node:process';
import Store from 'electron-store';
import { PtyManager } from './pty-manager';
import type { CliSettings } from '../config/types';
import { ICON_PATH, PRELOAD_PATH, RENDERER_INDEX_PATH } from '../config/paths';

interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export class WindowManager {
  private windows: Set<BrowserWindow> = new Set();
  private ptyManagers: Map<number, PtyManager> = new Map();
  private store = new Store();
  private saveBoundsTimeout: NodeJS.Timeout | null = null;

  constructor() {}

  async createWindow(options?: {
    cwd?: string;
    sessionId?: string;
    initialView?: 'welcome' | 'workspace';
  }) {
    try {
      const cliTheme = await this.getThemeFromSettings();
      const bounds = this.store.get('windowBounds', {
        width: 900,
        height: 600,
      }) as WindowBounds;

      const window = new BrowserWindow({
        ...bounds,
        title: 'Gemini CLI',
        icon: ICON_PATH,
        titleBarStyle: 'hidden',
        backgroundColor: cliTheme ? cliTheme.colors.Background : '#282a36',
        webPreferences: {
          preload: PRELOAD_PATH,
          sandbox: true,
        },
      });

      this.windows.add(window);

      const queryParams = new URLSearchParams();
      if (options?.cwd) queryParams.append('cwd', options.cwd);
      if (options?.sessionId) queryParams.append('sessionId', options.sessionId);
      if (options?.initialView) queryParams.append('initialView', options.initialView);
      
      const queryString = queryParams.toString();
      const url = process.env.VITE_DEV_SERVER_URL
        ? `${process.env.VITE_DEV_SERVER_URL}?${queryString}`
        : `${RENDERER_INDEX_PATH}?${queryString}`; // For file protocol, query params might need special handling or hash

      if (process.env.VITE_DEV_SERVER_URL) {
        window.loadURL(url);
      } else {
        // loadFile doesn't support query params directly in the path usually for some electron versions, 
        // but we can use loadURL with file:// protocol
        window.loadURL(`file://${RENDERER_INDEX_PATH}?${queryString}`);
      }

      const ptyManager = new PtyManager(window);
      this.ptyManagers.set(window.id, ptyManager);
      
      // Calculate initial cols/rows based on window size
      // These are rough estimates; the frontend will resize properly once loaded
      // Assuming char width ~9px and height ~18px (typical for monospace 12-14px)
      // Subtracting sidebar (~250px) and padding (~20px)
      const initialCols = Math.max(80, Math.floor((bounds.width - 270) / 9));
      const initialRows = Math.max(30, Math.floor((bounds.height - 40) / 18));

      // Start PTY with the provided session ID or a new default one
      // We use the estimated dimensions to ensure we pass valid numbers
      ptyManager.start(options?.sessionId || 'default', options?.cwd, initialCols, initialRows);

      window.on('closed', () => {
        ptyManager.dispose();
        this.ptyManagers.delete(window.id);
        this.windows.delete(window);
      });

      window.on('resize', () => {
        this.handleResize(window);
        this.saveBounds(window);
      });

      window.on('move', () => {
        this.saveBounds(window);
      });

      window.webContents.on('did-finish-load', () => {
        if (cliTheme && !window.isDestroyed()) {
          window.webContents.send('theme:init', cliTheme);
        }
      });
    } catch (e) {
      const error = e as Error;
      dialog.showErrorBox(
        'Error in createWindow',
        `Message: ${error.message}\nStack: ${error.stack}`,
      );
      // Only quit if no windows are left? Or just log.
      if (this.windows.size === 0) {
        app.quit();
      }
    }
  }

  getMainWindow(): BrowserWindow | null {
    // Return the focused window or the first one
    return BrowserWindow.getFocusedWindow() || this.windows.values().next().value || null;
  }

  getPtyManager(window?: BrowserWindow): PtyManager | null {
    const targetWindow = window || this.getMainWindow();
    return targetWindow ? this.ptyManagers.get(targetWindow.id) || null : null;
  }

  getIconPath(): string {
    return ICON_PATH;
  }

  async getThemeFromSettings() {
    const { loadSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    const { themeManager } = await import(
      '@google/gemini-cli/dist/src/ui/themes/theme-manager.js'
    );
    const { merged } = await loadSettings(os.homedir());
    const settings = merged as CliSettings;
    const themeName = settings.theme;
    if (!themeName) {
      return undefined;
    }

    themeManager.loadCustomThemes(settings.customThemes);
    return themeManager.getTheme(themeName);
  }

  private handleResize(window: BrowserWindow) {
    if (!window.isDestroyed()) {
      const [width, height] = window.getContentSize();
      window.webContents.send('main-window-resize', {
        width,
        height,
      });
    }
  }

  private saveBounds(window: BrowserWindow) {
    if (this.saveBoundsTimeout) {
      clearTimeout(this.saveBoundsTimeout);
    }
    this.saveBoundsTimeout = setTimeout(() => {
      if (!window.isDestroyed()) {
        this.store.set('windowBounds', window.getBounds());
      }
    }, 500);
  }
}
