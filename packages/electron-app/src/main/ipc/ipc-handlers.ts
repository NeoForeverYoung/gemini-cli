/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { z } from 'zod';
import Store from 'electron-store';
import os from 'node:os';
import fs from 'node:fs';
import { join, extname, resolve, sep, isAbsolute } from 'node:path';
import type { WindowManager } from '../managers/window-manager';
import type { CliSettings } from '../config/types';
import { deepMerge } from '../utils/utils';
import { GitService } from '../services/GitService';
import { SessionService } from '../services/SessionService';
import { ChangelogService } from '../services/ChangelogService';
import { McpService } from '../services/McpService';
import { ExtensionsService } from '../services/ExtensionsService';
import type {
  Settings,
  SettingsSchema,
  SettingDefinition,
  SettingEnumOption,
} from '@google/gemini-cli';

const store = new Store();
const DIFF_ROOT = join(os.homedir(), '.gemini', 'tmp', 'diff');

function resolvePath(p: string): string {
  if (isAbsolute(p)) {
    return p;
  }
  if (p.startsWith('~/')) {
    return join(os.homedir(), p.slice(2));
  }
  return resolve(os.homedir(), p);
}

// Validation Schemas
const resizeSchema = z.object({
  sessionId: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

const resolveSchema = z.object({
  diffPath: z.string().min(1),
  status: z.string(),
  content: z.string().optional(),
});

const settingsSetSchema = z.object({
  changes: z.record(z.unknown()),
  scope: z.enum(['User', 'System', 'Workspace']).optional(),
});

const themeSetSchema = z.enum(['light', 'dark']);

const languageMapSetSchema = z.record(z.string());

const windowCreateSchema = z.object({
  cwd: z.string().optional(),
  sessionId: z.string().optional(),
  initialView: z.enum(['welcome', 'workspace']).optional(),
});

// Helper functions for settings validation
function validateSettingValue(
  value: unknown,
  definition: SettingDefinition,
  path: string,
) {
  if (value === undefined || value === null) {
    return;
  }

  switch (definition.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new Error(
          `Invalid type for ${path}: expected string, got ${typeof value}`,
        );
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(
          `Invalid type for ${path}: expected boolean, got ${typeof value}`,
        );
      }
      break;
    case 'number':
      if (typeof value !== 'number') {
        throw new Error(
          `Invalid type for ${path}: expected number, got ${typeof value}`,
        );
      }
      break;
    case 'enum':
      if (definition.options) {
        const validValues = definition.options.map(
          (o: SettingEnumOption) => o.value,
        );
        if (
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean'
        ) {
          throw new Error(
            `Invalid type for ${path}: expected string, number, or boolean, got ${typeof value}`,
          );
        }
        // We cast value to string | number | boolean to match validValues types roughly,
        // though SettingEnumOption.value is string | number.
        // Actually validValues is (string | number)[].
        if (!validValues.includes(value as string | number)) {
          throw new Error(
            `Invalid value for ${path}: expected one of [${validValues.join(', ')}], got ${value}`,
          );
        }
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        throw new Error(
          `Invalid type for ${path}: expected array, got ${typeof value}`,
        );
      }
      break;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(
          `Invalid type for ${path}: expected object, got ${typeof value}`,
        );
      }
      if (definition.properties) {
        const objValue = value as Record<string, unknown>;
        for (const key in objValue) {
          if (definition.properties[key]) {
            validateSettingValue(
              objValue[key],
              definition.properties[key],
              `${path}.${key}`,
            );
          }
        }
      }
      break;
    default:
      // Handle other types or unknown types if necessary, or do nothing if they don't need validation.
      break;
  }
}

function validateSettings(settings: unknown, schema: SettingsSchema) {
  if (typeof settings !== 'object' || settings === null) {
    throw new Error('Settings must be an object');
  }
  const settingsObj = settings as Record<string, unknown>;
  for (const key in settingsObj) {
    if (schema[key]) {
      validateSettingValue(settingsObj[key], schema[key], key);
    }
  }
}

export function registerIpcHandlers(windowManager: WindowManager) {
  let prevResize = [0, 0];
  const gitService = new GitService(windowManager);
  const sessionService = new SessionService();
  const changelogService = new ChangelogService();
  const mcpService = new McpService();
  const extensionsService = new ExtensionsService();

  ipcMain.on('git:watch-workspaces', (_event, paths: string[]) => {
    gitService.watch(paths);
  });

  ipcMain.handle('git:get-history', async (_event, cwd: string) => {
    return gitService.getHistory(cwd);
  });

  ipcMain.handle(
    'git:stage-file',
    async (_event, cwd: string, file: string) => {
      return gitService.stageFile(cwd, file);
    },
  );

  ipcMain.handle(
    'git:unstage-file',
    async (_event, cwd: string, file: string) => {
      return gitService.unstageFile(cwd, file);
    },
  );

  ipcMain.handle(
    'git:revert-file',
    async (_event, cwd: string, file: string) => {
      return gitService.revertFile(cwd, file);
    },
  );

  ipcMain.handle(
    'git:get-file-diff',
    async (_event, cwd: string, filePath: string) => {
      return gitService.getFileDiff(cwd, filePath);
    },
  );

  ipcMain.handle('sessions:get-recent', async () => {
    return sessionService.getRecentSessions();
  });

  ipcMain.handle('sessions:delete', async (_event, hash: string, tag: string) => {
    return sessionService.deleteSession(hash, tag);
  });

  ipcMain.handle('changelog:get', async () => {
    return changelogService.getChangelog();
  });

  ipcMain.handle('mcp:get-servers', async () => {
    return mcpService.getConfiguredServers();
  });

  ipcMain.handle('extensions:get-list', async () => {
    return extensionsService.getInstalledExtensions();
  });

  ipcMain.handle('extensions:get-available', async () => {
    return extensionsService.getAvailableExtensions();
  });

  ipcMain.handle('extensions:install', async (_event, source: string) => {
    return extensionsService.installExtension(source);
  });

  ipcMain.handle('extensions:uninstall', async (_event, name: string) => {
    return extensionsService.uninstallExtension(name);
  });

  ipcMain.on('shell:open-external', (_event, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.on('terminal:send-input', (_event, sessionId: string, data: string) => {
    const window = BrowserWindow.fromWebContents(_event.sender);
    if (window) {
      windowManager.getPtyManager(window)?.write(sessionId, data);
    }
  });

  ipcMain.handle('dialog:open-directory', async (_event) => {
    const window = BrowserWindow.fromWebContents(_event.sender);
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.on('terminal.keystroke', (_event, sessionId: string, key: string) => {
    const window = BrowserWindow.fromWebContents(_event.sender);
    if (window) {
      windowManager.getPtyManager(window)?.write(sessionId, key);
    }
  });

  ipcMain.on('terminal.resize', (_event, payload) => {
    const parseResult = resizeSchema.safeParse(payload);
    if (!parseResult.success) {
      console.warn('[IPC] Invalid terminal.resize payload:', parseResult.error);
      return;
    }
    const { sessionId, cols, rows } = parseResult.data;

    const window = BrowserWindow.fromWebContents(_event.sender);
    if (window) {
      windowManager.getPtyManager(window)?.resize(sessionId, cols, rows);
    }
  });

  ipcMain.handle(
    'settings:restart-terminal',
    async (
      _event,
      sessionId: string,
      cwd?: string,
      shouldResume: boolean = true,
      cols?: number,
      rows?: number,
    ) => {
      if (!sessionId) {
        console.error('[IPC] restart-terminal called without sessionId');
        return;
      }
      
      // Default to a reasonable size if not provided, but ideally frontend always provides it
      const finalCols = cols || 80;
      const finalRows = rows || 30;

      const window = BrowserWindow.fromWebContents(_event.sender);
      if (window) {
        await windowManager
          .getPtyManager(window)
          ?.start(sessionId, cwd, finalCols, finalRows, shouldResume);
      }
    },
  );

  ipcMain.on('theme:set', (_event, payload) => {
    const parseResult = themeSetSchema.safeParse(payload);
    if (!parseResult.success) {
      console.warn('[IPC] Invalid theme:set payload:', parseResult.error);
      return;
    }
    const theme = parseResult.data;
    const backgroundColor = theme === 'dark' ? '#282a36' : '#ffffff';
    const window = BrowserWindow.fromWebContents(_event.sender);
    if (window && !window.isDestroyed()) {
      window.setBackgroundColor(backgroundColor);
    }
  });

  ipcMain.handle('window:create', async (_event, options) => {
    const parseResult = windowCreateSchema.safeParse(options);
    if (parseResult.success) {
      await windowManager.createWindow(parseResult.data);
    }
  });

  ipcMain.handle('window:open-directory-and-create', async (_event) => {
    const window = BrowserWindow.fromWebContents(_event.sender);
    const result = await dialog.showOpenDialog(window || undefined, {
      properties: ['openDirectory'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      await windowManager.createWindow({
        cwd: result.filePaths[0],
        initialView: 'workspace',
      });
    }
  });

  ipcMain.handle('gemini-editor:resolve', async (_event, payload) => {
    const parseResult = resolveSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error(
        '[IPC] Invalid gemini-editor:resolve payload:',
        parseResult.error,
      );
      return { success: false, error: 'Invalid payload' };
    }
    const { diffPath, status, content } = parseResult.data;

    try {
      // Security check for path traversal
      const normalizedDiffPath = resolve(diffPath);
      if (
        normalizedDiffPath !== DIFF_ROOT &&
        !normalizedDiffPath.startsWith(DIFF_ROOT + sep)
      ) {
        console.error(
          '[Security] Attempted path traversal in diff resolve:',
          diffPath,
        );
        return { success: false, error: 'Invalid diff path' };
      }

      const metaPath = join(normalizedDiffPath, 'meta.json');
      const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
      const fileType = extname(meta.filePath);
      const newFilePath = join(normalizedDiffPath, `new${fileType}`);
      const responsePath = join(normalizedDiffPath, 'response.json');

      if (status === 'approve') {
        await fs.promises.writeFile(newFilePath, content || '');
      }
      await fs.promises.writeFile(responsePath, JSON.stringify({ status }));
      return { success: true };
    } catch (e) {
      console.error('Error resolving gemini-editor request:', e);
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('settings:get', async () => {
    const { loadSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    const settings = await loadSettings(os.homedir());
    const merged = settings.merged as CliSettings;

    if (!merged.terminalCwd) {
      merged.terminalCwd = join(os.homedir(), 'Documents');
    } else {
      merged.terminalCwd = resolvePath(merged.terminalCwd);
    }

    if (merged.context?.includeDirectories) {
      merged.context.includeDirectories = merged.context.includeDirectories.map(
        (dir) => resolvePath(dir),
      );
    }

    if (typeof merged.env === 'object' && merged.env !== null) {
      merged.env = Object.entries(merged.env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    }

    return {
      system: settings.system,
      user: settings.user,
      workspace: settings.workspace,
      merged,
    };
  });

  ipcMain.handle('settings:get-schema', async () => {
    try {
      const { getSettingsSchema } = await import(
        '@google/gemini-cli/dist/src/config/settingsSchema.js'
      );
      return getSettingsSchema();
    } catch (error) {
      console.error('[IPC] Failed to load settings schema:', error);
      throw error;
    }
  });

  ipcMain.handle('themes:get', async () => {
    const { loadSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    const { themeManager } = await import(
      '@google/gemini-cli/dist/src/ui/themes/theme-manager.js'
    );
    const { merged } = await loadSettings(os.homedir());
    const settings = merged as CliSettings;
    themeManager.loadCustomThemes(settings.customThemes);
    return themeManager.getAvailableThemes();
  });

  ipcMain.handle('settings:set', async (_event, payload) => {
    const parseResult = settingsSetSchema.safeParse(payload);
    if (!parseResult.success) {
      return { success: false, error: 'Invalid payload' };
    }
    const { changes, scope = 'User' } = parseResult.data;

    const { loadSettings, saveSettings, SettingScope } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    const { getSettingsSchema } = await import(
      '@google/gemini-cli/dist/src/config/settingsSchema.js'
    );
    try {
      const loadedSettings = await loadSettings(os.homedir());

      let scopeEnum: (typeof SettingScope)[keyof typeof SettingScope];
      if (scope === 'Workspace') {
        scopeEnum = SettingScope.Workspace;
      } else if (scope === 'System') {
        scopeEnum = SettingScope.System;
      } else {
        scopeEnum = SettingScope.User;
      }

      const settingsFile = loadedSettings.forScope(scopeEnum);

      const newSettings = { ...settingsFile.settings } as CliSettings;
      const typedChanges = changes as CliSettings;

      if (typedChanges.mcpServers) {
        newSettings.mcpServers = typedChanges.mcpServers;
        delete typedChanges.mcpServers;
      }

      if (typedChanges.env) {
        newSettings.env = typedChanges.env;
        delete typedChanges.env;
      }

      const mergedSettings = deepMerge(newSettings, typedChanges);

      // Validate settings before saving
      const schema = getSettingsSchema();
      validateSettings(mergedSettings, schema);

      saveSettings({
        path: settingsFile.path,
        settings: mergedSettings as unknown as Settings,
        originalSettings: mergedSettings as unknown as Settings,
      });

      const newTheme = await windowManager.getThemeFromSettings();
      if (newTheme) {
        const mainWindow = windowManager.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('theme:init', newTheme);
          mainWindow.setBackgroundColor(newTheme.colors.Background);
        }
      }
      return { success: true };
    } catch (error) {
      console.error('Error writing settings.json:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('language-map:get', async () => store.get('languageMap', {}));

  ipcMain.handle('language-map:set', async (_event, payload) => {
    const parseResult = languageMapSetSchema.safeParse(payload);
    if (parseResult.success) {
      store.set('languageMap', parseResult.data);
    }
  });

  ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      console.error(`[IPC] Failed to save file ${filePath}:`, error);
      return { success: false, error: (error as Error).message };
    }
  });
}
