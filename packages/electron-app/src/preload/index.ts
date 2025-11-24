/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Settings } from '@google/gemini-cli';
import type {
  TerminalResizePayload,
  GeminiEditorResolvePayload,
  ThemeSetPayload,
  MainWindowResizePayload,
} from '../shared/types';
import type { WorkspaceGitStatus } from '../types/git';
import type { Session } from '../types/session';

contextBridge.exposeInMainWorld('electron', {
  onMainWindowResize: (
    callback: (event: IpcRendererEvent, data: MainWindowResizePayload) => void,
  ) => {
    const channel = 'main-window-resize';
    ipcRenderer.on(channel, callback);
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  },
  window: {
    create: (options?: {
      cwd?: string;
      sessionId?: string;
      initialView?: 'welcome' | 'workspace';
    }) => ipcRenderer.invoke('window:create', options),
    openDirectoryAndCreate: () =>
      ipcRenderer.invoke('window:open-directory-and-create'),
  },
  git: {
    watchWorkspaces: (paths: string[]) =>
      ipcRenderer.send('git:watch-workspaces', paths),
    onStatusUpdate: (
      callback: (event: IpcRendererEvent, status: WorkspaceGitStatus) => void,
    ) => {
      const channel = 'git:status-update';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
    getHistory: (cwd: string) => ipcRenderer.invoke('git:get-history', cwd),
    stageFile: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:stage-file', cwd, file),
    unstageFile: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:unstage-file', cwd, file),
    revertFile: (cwd: string, file: string) =>
      ipcRenderer.invoke('git:revert-file', cwd, file),
    getFileDiff: (cwd: string, filePath: string) =>
      ipcRenderer.invoke('git:get-file-diff', cwd, filePath),
  },
  sessions: {
    getRecent: () => ipcRenderer.invoke('sessions:get-recent'),
    delete: (hash: string, tag: string) =>
      ipcRenderer.invoke('sessions:delete', hash, tag),
  },
  changelog: {
    get: () => ipcRenderer.invoke('changelog:get'),
  },
  mcp: {
    getServers: () => ipcRenderer.invoke('mcp:get-servers'),
  },
  extensions: {
    getList: () => ipcRenderer.invoke('extensions:get-list'),
    getAvailable: () => ipcRenderer.invoke('extensions:get-available'),
    install: (source: string) => ipcRenderer.invoke('extensions:install', source),
    uninstall: (name: string) => ipcRenderer.invoke('extensions:uninstall', name),
  },
  terminal: {
    onData: (
      callback: (
        event: IpcRendererEvent,
        payload: { sessionId: string; data: string } | string,
      ) => void,
    ) => {
      const channel = 'terminal.incomingData';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
    onReady: (callback: (event: IpcRendererEvent) => void) => {
      const channel = 'terminal.ready';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
    sendKey: (sessionId: string, key: string) =>
      ipcRenderer.send('terminal.keystroke', sessionId, key),
    sendInput: (sessionId: string, data: string) =>
      ipcRenderer.send('terminal:send-input', sessionId, data),
    resize: (size: TerminalResizePayload) =>
      ipcRenderer.send('terminal.resize', size),
    onReset: (callback: (event: IpcRendererEvent) => void) => {
      const channel = 'terminal.reset';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
    onNotFound: (
      callback: (
        event: IpcRendererEvent,
        payload: { sessionId: string },
      ) => void,
    ) => {
      const channel = 'terminal.notFound';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
  },
  theme: {
    set: (theme: ThemeSetPayload) => ipcRenderer.send('theme:set', theme),
    onInit: (
      callback: (
        event: IpcRendererEvent,
        theme: Record<string, string>,
      ) => void,
    ) => {
      const channel = 'theme:init';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
  },
  themes: {
    get: () => ipcRenderer.invoke('themes:get'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    getSchema: () => ipcRenderer.invoke('settings:get-schema'),
    set: (settings: { changes: Partial<Settings>; scope?: string }) =>
      ipcRenderer.invoke('settings:set', settings),
    restartTerminal: (
      sessionId: string,
      cwd?: string,
      shouldResume?: boolean,
    ) =>
      ipcRenderer.invoke(
        'settings:restart-terminal',
        sessionId,
        cwd,
        shouldResume,
      ),
  },
  languageMap: {
    get: () => ipcRenderer.invoke('language-map:get'),
    set: (map: Record<string, string>) =>
      ipcRenderer.invoke('language-map:set', map),
  },
  onShowGeminiEditor: (
    callback: (
      event: IpcRendererEvent,
      data: {
        filePath: string;
        oldContent: string;
        newContent: string;
        meta: { filePath: string };
        diffPath: string;
      },
    ) => void,
  ) => {
    const channel = 'gemini-editor:show';
    ipcRenderer.on(channel, callback);
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  },
  resolveDiff: (result: GeminiEditorResolvePayload) =>
    ipcRenderer.invoke('gemini-editor:resolve', result),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  openExternal: (url: string) => ipcRenderer.send('shell:open-external', url),
  file: {
    save: (filePath: string, content: string) =>
      ipcRenderer.invoke('file:save', filePath, content),
  },
});
