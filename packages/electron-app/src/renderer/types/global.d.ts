/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Settings,
  ThemeDisplay,
  SettingsSchema,
} from '@google/gemini-cli';
import type { IpcRendererEvent } from 'electron';
import type {
  TerminalResizePayload,
  GeminiEditorResolvePayload,
  ThemeSetPayload,
  MainWindowResizePayload,
} from '../../../shared/types';
import type { WorkspaceGitStatus, FileDiff } from '../../types/git';
import type { Session } from '../../types/session';
import type { McpServers } from './mcp';
import type { ExtensionInfo, AvailableExtension } from './extensions';

export interface GeminiEditorData {
  filePath: string;
  oldContent: string;
  newContent: string;
  diffPath: string;
  meta: {
    filePath: string;
  };
}

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface CliTheme {
  colors: {
    Background: string;
    Foreground: string;
    AccentRed: string;
    AccentGreen: string;
    AccentYellow: string;
    AccentBlue: string;
    AccentPurple: string;
    AccentCyan: string;
  };
}

export type IncomingTheme = Partial<CliTheme> & Partial<XtermTheme>;

export interface IElectronAPI {
  onMainWindowResize: (
    callback: (event: IpcRendererEvent, data: MainWindowResizePayload) => void,
  ) => () => void;
  window: {
    create: (options?: {
      cwd?: string;
      sessionId?: string;
      initialView?: 'welcome' | 'workspace';
    }) => Promise<void>;
    openDirectoryAndCreate: () => Promise<void>;
  };
  git: {
    watchWorkspaces: (paths: string[]) => void;
    onStatusUpdate: (
      callback: (event: IpcRendererEvent, status: WorkspaceGitStatus) => void,
    ) => () => void;
    getHistory: (cwd: string) => Promise<
      {
        hash: string;
        message: string;
        author: string;
        date: string;
      }[]
    >;
    stageFile: (cwd: string, file: string) => Promise<void>;
    unstageFile: (cwd: string, file: string) => Promise<void>;
    revertFile: (cwd: string, file: string) => Promise<void>;
    getFileDiff: (cwd: string, filePath: string) => Promise<FileDiff>;
  };
  sessions: {
    getRecent: () => Promise<Session[]>;
    delete: (hash: string, tag: string) => Promise<void>;
  };
  changelog: {
    get: () => Promise<string>;
  };
  mcp: {
    getServers: () => Promise<McpServers>;
  };
  extensions: {
    getList: () => Promise<ExtensionInfo[]>;
    getAvailable: () => Promise<AvailableExtension[]>;
    install: (source: string) => Promise<void>;
    uninstall: (name: string) => Promise<void>;
  };
  terminal: {
    onData: (
      callback: (
        event: IpcRendererEvent,
        payload: { sessionId: string; data: string } | string,
      ) => void,
    ) => () => void;
    onReady: (callback: (event: IpcRendererEvent) => void) => () => void;
    sendKey: (sessionId: string, key: string) => void;
    sendInput: (sessionId: string, data: string) => void;
    resize: (size: TerminalResizePayload) => void;
    onReset: (callback: (event: IpcRendererEvent) => void) => () => void;
    onNotFound: (
      callback: (
        event: IpcRendererEvent,
        payload: { sessionId: string },
      ) => void,
    ) => () => void;
  };
  theme: {
    set: (theme: ThemeSetPayload) => void;
    onInit: (
      callback: (event: IpcRendererEvent, theme: IncomingTheme) => void,
    ) => () => void;
  };
  themes: {
    get: () => Promise<ThemeDisplay[]>;
  };
  settings: {
    get: () => Promise<{
      merged: Partial<Settings>;
      user: Partial<Settings>;
      workspace: Partial<Settings>;
      system: Partial<Settings>;
    }>;
    getSchema: () => Promise<SettingsSchema>;
    set: (settings: {
      changes: Partial<Settings>;
      scope?: string;
    }) => Promise<void>;
    restartTerminal: (
      sessionId: string,
      cwd?: string,
      shouldResume?: boolean,
      cols?: number,
      rows?: number,
    ) => Promise<void>;
  };
  languageMap: {
    get: () => Promise<Record<string, string>>;
    set: (map: Record<string, string>) => void;
  };
  onShowGeminiEditor: (
    callback: (event: IpcRendererEvent, data: GeminiEditorData) => void,
  ) => () => void;
  resolveDiff: (
    result: GeminiEditorResolvePayload,
  ) => Promise<{ success: boolean; error?: string }>;
  openDirectory: () => Promise<string | null>;
  openExternal: (url: string) => void;
  file: {
    save: (
      filePath: string,
      content: string,
    ) => Promise<{ success: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
