/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as osActual from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { isWorkspaceTrusted } from './trustedFolders.js';

// These imports will get the versions from the vi.mock('./settings.js', ...) factory.
import {
  loadSettings,
  migrateSettingsToV1,
  needsMigration,
  type Settings,
  loadEnvironment,
  migrateDeprecatedSettings,
  SettingScope,
  saveSettings,
  type SettingsFile,
} from './settings.js';
import { FatalConfigError, GEMINI_DIR } from '@google/gemini-cli-core';
import { ExtensionManager } from './extension-manager.js';
import { updateSettingsFilePreservingFormat } from '../utils/commentJson.js';
import fs from 'node:fs';

// A more flexible type for test data that allows arbitrary properties.
type TestSettings = Settings & { [key: string]: unknown };

const mocks = vi.hoisted(() => ({
  homedir: vi.fn(),
  isWorkspaceTrusted: vi
    .fn()
    .mockReturnValue({ isTrusted: true, source: 'file' }),
}));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    platform: vi.fn(() => 'linux'),
    homedir: mocks.homedir,
  };
});

vi.mock('./extension.js');

// Mock trustedFolders
vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: mocks.isWorkspaceTrusted,
}));

const mockCoreEvents = vi.hoisted(() => ({
  emitFeedback: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: mockCoreEvents,
  };
});

vi.mock('../utils/commentJson.js', () => ({
  updateSettingsFilePreservingFormat: vi.fn(),
}));

describe('Settings Loading and Merging', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userSettingsPath: string;
  let workspaceSettingsPath: string;
  let systemSettingsPath: string;
  let systemDefaultsPath: string;

  beforeEach(() => {
    vi.resetAllMocks();
    // Create a temporary home directory for the user
    tempHomeDir = fs.mkdtempSync(
      path.join(osActual.tmpdir(), 'gemini-test-home-'),
    );
    mocks.homedir.mockReturnValue(tempHomeDir);

    // Create a temporary workspace directory
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(osActual.tmpdir(), 'gemini-test-workspace-'),
    );

    // Define paths based on the temporary directories
    userSettingsPath = path.join(tempHomeDir, '.gemini', 'settings.json');
    workspaceSettingsPath = path.join(
      tempWorkspaceDir,
      '.gemini',
      'settings.json',
    );
    // These can be anywhere for the test, so we'll put them in the temp home dir too
    systemSettingsPath = path.join(tempHomeDir, 'system', 'settings.json');
    systemDefaultsPath = path.join(
      path.dirname(systemSettingsPath),
      'system-defaults.json',
    );

    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = systemSettingsPath;
    process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH'] = systemDefaultsPath;

    mocks.isWorkspaceTrusted.mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
  });

  afterEach(() => {
    // Clean up the temporary directories
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    delete process.env['GEMINI_CLI_SYSTEM_DEFAULTS_PATH'];
    vi.restoreAllMocks();
  });

  describe('loadSettings', () => {
    it('should load empty settings if no files exist', () => {
      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.system.settings).toEqual({});
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual({});
    });

    it('should load system settings if only system file exists', () => {
      const content = {
        ui: { theme: 'system-default' },
        tools: { sandbox: false },
      };
      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(systemSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.system.settings).toEqual(content);
      expect(settings.merged).toEqual(content);
    });

    it('should load user settings if only user file exists', () => {
      const content = {
        ui: { theme: 'dark' },
        context: { fileName: 'USER_CONTEXT.md' },
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.user.settings).toEqual(content);
      expect(settings.merged).toEqual(content);
    });

    it('should load workspace settings if only workspace file exists', () => {
      const content = {
        tools: { sandbox: true },
        context: { fileName: 'WORKSPACE_CONTEXT.md' },
      };
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(workspaceSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.workspace.settings).toEqual(content);
      expect(settings.merged).toEqual(content);
    });

    it('should merge system, user and workspace settings, with system taking precedence over workspace, and workspace over user', () => {
      const systemSettingsContent = {
        ui: {
          theme: 'system-theme',
        },
        tools: {
          sandbox: false,
        },
        mcp: {
          allowed: ['server1', 'server2'],
        },
        telemetry: { enabled: false },
      };
      const userSettingsContent = {
        ui: {
          theme: 'dark',
        },
        tools: {
          sandbox: true,
        },
        context: {
          fileName: 'USER_CONTEXT.md',
        },
      };
      const workspaceSettingsContent = {
        tools: {
          sandbox: false,
          core: ['tool1'],
        },
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
        },
        mcp: {
          allowed: ['server1', 'server2', 'server3'],
        },
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.system.settings).toEqual(systemSettingsContent);
      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toEqual({
        ui: {
          theme: 'system-theme',
        },
        tools: {
          sandbox: false,
          core: ['tool1'],
        },
        telemetry: { enabled: false },
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
        },
        mcp: {
          allowed: ['server1', 'server2'],
        },
      });
    });

    it('should correctly migrate a complex legacy (v1) settings file', () => {
      const legacySettingsContent = {
        theme: 'legacy-dark',
        vimMode: true,
        contextFileName: 'LEGACY_CONTEXT.md',
        model: 'gemini-pro',
        mcpServers: {
          'legacy-server-1': {
            command: 'npm',
            args: ['run', 'start:server1'],
            description: 'Legacy Server 1',
          },
          'legacy-server-2': {
            command: 'node',
            args: ['server2.js'],
            description: 'Legacy Server 2',
          },
        },
        allowMCPServers: ['legacy-server-1'],
        someUnrecognizedSetting: 'should-be-preserved',
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(legacySettingsContent));

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.merged).toEqual({
        ui: {
          theme: 'legacy-dark',
        },
        general: {
          vimMode: true,
        },
        context: {
          fileName: 'LEGACY_CONTEXT.md',
        },
        model: {
          name: 'gemini-pro',
        },
        mcpServers: {
          'legacy-server-1': {
            command: 'npm',
            args: ['run', 'start:server1'],
            description: 'Legacy Server 1',
          },
          'legacy-server-2': {
            command: 'node',
            args: ['server2.js'],
            description: 'Legacy Server 2',
          },
        },
        mcp: {
          allowed: ['legacy-server-1'],
        },
        someUnrecognizedSetting: 'should-be-preserved',
      });
    });

    it('should rewrite allowedTools to tools.allowed during migration', () => {
      const legacySettingsContent = {
        allowedTools: ['fs', 'shell'],
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(legacySettingsContent));

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.merged.tools?.allowed).toEqual(['fs', 'shell']);
      expect((settings.merged as TestSettings)['allowedTools']).toBeUndefined();
    });

    it('should correctly merge and migrate legacy array properties from multiple scopes', () => {
      const legacyUserSettings = {
        includeDirectories: ['/user/dir'],
        excludeTools: ['user-tool'],
        excludedProjectEnvVars: ['USER_VAR'],
      };
      const legacyWorkspaceSettings = {
        includeDirectories: ['/workspace/dir'],
        excludeTools: ['workspace-tool'],
        excludedProjectEnvVars: ['WORKSPACE_VAR', 'USER_VAR'],
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(legacyUserSettings));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(legacyWorkspaceSettings),
      );

      const settings = loadSettings(tempWorkspaceDir);

      // Verify includeDirectories are concatenated
      expect(settings.merged.context?.includeDirectories).toEqual([
        '/user/dir',
        '/workspace/dir',
      ]);

      // Verify excludeTools are concatenated and de-duped
      expect(settings.merged.tools?.exclude).toEqual([
        'user-tool',
        'workspace-tool',
      ]);

      // Verify excludedProjectEnvVars are concatenated and de-duped
      expect(settings.merged.advanced?.excludedEnvVars).toEqual(
        expect.arrayContaining(['USER_VAR', 'WORKSPACE_VAR']),
      );
      expect(settings.merged.advanced?.excludedEnvVars).toHaveLength(2);
    });

    it('should merge all settings files with the correct precedence', () => {
      const systemDefaultsContent = {
        ui: {
          theme: 'default-theme',
        },
        tools: {
          sandbox: true,
        },
        telemetry: true,
        context: {
          includeDirectories: ['/system/defaults/dir'],
        },
      };
      const userSettingsContent = {
        ui: {
          theme: 'user-theme',
        },
        context: {
          fileName: 'USER_CONTEXT.md',
          includeDirectories: ['/user/dir1', '/user/dir2'],
        },
      };
      const workspaceSettingsContent = {
        tools: {
          sandbox: false,
        },
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
          includeDirectories: ['/workspace/dir'],
        },
      };
      const systemSettingsContent = {
        ui: {
          theme: 'system-theme',
        },
        telemetry: false,
        context: {
          includeDirectories: ['/system/dir'],
        },
      };

      fs.mkdirSync(path.dirname(systemDefaultsPath), { recursive: true });
      fs.writeFileSync(
        systemDefaultsPath,
        JSON.stringify(systemDefaultsContent),
      );
      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.systemDefaults.settings).toEqual(systemDefaultsContent);
      expect(settings.system.settings).toEqual(systemSettingsContent);
      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toEqual({
        context: {
          fileName: 'WORKSPACE_CONTEXT.md',
          includeDirectories: [
            '/system/defaults/dir',
            '/user/dir1',
            '/user/dir2',
            '/workspace/dir',
            '/system/dir',
          ],
        },
        telemetry: false,
        tools: {
          sandbox: false,
        },
        ui: {
          theme: 'system-theme',
        },
      });
    });

    it('should use folderTrust from workspace settings when trusted', () => {
      const userSettingsContent = {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      };
      const workspaceSettingsContent = {
        security: {
          folderTrust: {
            enabled: false, // This should be used
          },
        },
      };
      const systemSettingsContent = {
        // No folderTrust here
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.security?.folderTrust?.enabled).toBe(false); // Workspace setting should be used
    });

    it('should use system folderTrust over user setting', () => {
      const userSettingsContent = {
        security: {
          folderTrust: {
            enabled: false,
          },
        },
      };
      const workspaceSettingsContent = {
        security: {
          folderTrust: {
            enabled: true, // This should be ignored
          },
        },
      };
      const systemSettingsContent = {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.security?.folderTrust?.enabled).toBe(true); // System setting should be used
    });

    it('should not allow user or workspace to override system disableYoloMode', () => {
      const userSettingsContent = {
        security: {
          disableYoloMode: false,
        },
      };
      const workspaceSettingsContent = {
        security: {
          disableYoloMode: false, // This should be ignored
        },
      };
      const systemSettingsContent = {
        security: {
          disableYoloMode: true,
        },
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.security?.disableYoloMode).toBe(true); // System setting should be used
    });

    it('should handle contextFileName in user settings correctly', () => {
      const content = { context: { fileName: 'CUSTOM.md' } };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.context?.fileName).toBe('CUSTOM.md');
    });

    it('should handle contextFileName in workspace settings correctly', () => {
      const content = { context: { fileName: 'PROJECT_SPECIFIC.md' } };
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(workspaceSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.context?.fileName).toBe('PROJECT_SPECIFIC.md');
    });

    it('should handle excludedProjectEnvVars in user settings correctly', () => {
      const content = {
        advanced: { excludedEnvVars: ['DEBUG', 'NODE_ENV', 'CUSTOM_VAR'] },
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'CUSTOM_VAR',
      ]);
    });

    it('should handle excludedProjectEnvVars in workspace settings correctly', () => {
      const content = {
        advanced: { excludedEnvVars: ['WORKSPACE_DEBUG', 'WORKSPACE_VAR'] },
      };
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(workspaceSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
    });

    it('should merge excludedProjectEnvVars with workspace taking precedence over user', () => {
      const userSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['DEBUG', 'NODE_ENV', 'USER_VAR'] },
      };
      const workspaceSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['WORKSPACE_DEBUG', 'WORKSPACE_VAR'] },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.user.settings.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'USER_VAR',
      ]);
      expect(settings.workspace.settings.advanced?.excludedEnvVars).toEqual([
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'USER_VAR',
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
    });

    it('should default contextFileName to undefined if not in any settings file', () => {
      const userSettingsContent = { ui: { theme: 'dark' } };
      const workspaceSettingsContent = { tools: { sandbox: true } };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.context?.fileName).toBeUndefined();
    });

    it('should load telemetry setting from user settings', () => {
      const content = { telemetry: { enabled: true } };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.telemetry?.enabled).toBe(true);
    });

    it('should load telemetry setting from workspace settings', () => {
      const content = { telemetry: { enabled: false } };
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(workspaceSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.telemetry?.enabled).toBe(false);
    });

    it('should prioritize workspace telemetry setting over user setting', () => {
      const userSettingsContent = { telemetry: { enabled: true } };
      const workspaceSettingsContent = { telemetry: { enabled: false } };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );
      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.telemetry?.enabled).toBe(false);
    });

    it('should have telemetry as undefined if not in any settings file', () => {
      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.telemetry).toBeUndefined();
      expect(settings.merged.ui).toBeUndefined();
      expect(settings.merged.mcpServers).toBeUndefined();
    });

    it('should merge MCP servers correctly, with workspace taking precedence', () => {
      const userSettingsContent = {
        mcpServers: {
          'user-server': {
            command: 'user-command',
            args: ['--user-arg'],
            description: 'User MCP server',
          },
          'shared-server': {
            command: 'user-shared-command',
            description: 'User shared server config',
          },
        },
      };
      const workspaceSettingsContent = {
        mcpServers: {
          'workspace-server': {
            command: 'workspace-command',
            args: ['--workspace-arg'],
            description: 'Workspace MCP server',
          },
          'shared-server': {
            command: 'workspace-shared-command',
            description: 'Workspace shared server config',
          },
        },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged.mcpServers).toEqual({
        'user-server': {
          command: 'user-command',
          args: ['--user-arg'],
          description: 'User MCP server',
        },
        'workspace-server': {
          command: 'workspace-command',
          args: ['--workspace-arg'],
          description: 'Workspace MCP server',
        },
        'shared-server': {
          command: 'workspace-shared-command',
          description: 'Workspace shared server config',
        },
      });
    });

    it('should handle MCP servers when only in user settings', () => {
      const content = {
        mcpServers: {
          'user-only-server': {
            command: 'user-only-command',
            description: 'User only server',
          },
        },
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.mcpServers).toEqual(content.mcpServers);
    });

    it('should handle MCP servers when only in workspace settings', () => {
      const content = {
        mcpServers: {
          'workspace-only-server': {
            command: 'workspace-only-command',
            description: 'Workspace only server',
          },
        },
      };
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(workspaceSettingsPath, JSON.stringify(content));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.mcpServers).toEqual(content.mcpServers);
    });

    it('should have mcpServers as undefined if not in any settings file', () => {
      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.mcpServers).toBeUndefined();
    });

    it('should merge MCP servers from system, user, and workspace with system taking precedence', () => {
      const systemSettingsContent = {
        mcpServers: {
          'shared-server': {
            command: 'system-command',
            args: ['--system-arg'],
          },
          'system-only-server': {
            command: 'system-only-command',
          },
        },
      };
      const userSettingsContent = {
        mcpServers: {
          'user-server': {
            command: 'user-command',
          },
          'shared-server': {
            command: 'user-command',
            description: 'from user',
          },
        },
      };
      const workspaceSettingsContent = {
        mcpServers: {
          'workspace-server': {
            command: 'workspace-command',
          },
          'shared-server': {
            command: 'workspace-command',
            args: ['--workspace-arg'],
          },
        },
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.merged.mcpServers).toEqual({
        'user-server': {
          command: 'user-command',
        },
        'workspace-server': {
          command: 'workspace-command',
        },
        'system-only-server': {
          command: 'system-only-command',
        },
        'shared-server': {
          command: 'system-command',
          args: ['--system-arg'],
        },
      });
    });

    it('should merge mcp allowed/excluded lists with system taking precedence over workspace', () => {
      const systemSettingsContent = {
        mcp: {
          allowed: ['system-allowed'],
        },
      };
      const userSettingsContent = {
        mcp: {
          allowed: ['user-allowed'],
          excluded: ['user-excluded'],
        },
      };
      const workspaceSettingsContent = {
        mcp: {
          allowed: ['workspace-allowed'],
          excluded: ['workspace-excluded'],
        },
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.merged.mcp).toEqual({
        allowed: ['system-allowed'],
        excluded: ['workspace-excluded'],
      });
    });

    describe('compressionThreshold settings', () => {
      it('should be taken from user settings if only present there', () => {
        const userContent = { model: { compressionThreshold: 0.5 } };
        fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
        fs.writeFileSync(userSettingsPath, JSON.stringify(userContent));

        const settings = loadSettings(tempWorkspaceDir);
        expect(settings.merged.model?.compressionThreshold).toEqual(0.5);
      });

      it('should be taken from workspace settings if only present there', () => {
        const workspaceContent = { model: { compressionThreshold: 0.8 } };
        fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
        fs.writeFileSync(
          workspaceSettingsPath,
          JSON.stringify(workspaceContent),
        );

        const settings = loadSettings(tempWorkspaceDir);
        expect(settings.merged.model?.compressionThreshold).toEqual(0.8);
      });

      it('should prioritize workspace settings over user settings', () => {
        const userContent = { model: { compressionThreshold: 0.5 } };
        const workspaceContent = { model: { compressionThreshold: 0.8 } };

        fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
        fs.writeFileSync(userSettingsPath, JSON.stringify(userContent));
        fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
        fs.writeFileSync(
          workspaceSettingsPath,
          JSON.stringify(workspaceContent),
        );

        const settings = loadSettings(tempWorkspaceDir);
        expect(settings.merged.model?.compressionThreshold).toEqual(0.8);
      });

      it('should be undefined if not in any settings file', () => {
        const settings = loadSettings(tempWorkspaceDir);
        expect(settings.merged.model?.compressionThreshold).toEqual(undefined);
      });
    });

    it('should use user compressionThreshold if workspace does not define it', () => {
      const userSettingsContent = {
        general: {},
        model: { compressionThreshold: 0.5 },
      };
      const workspaceSettingsContent = {
        general: {},
        model: {},
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.merged.model?.compressionThreshold).toEqual(0.5);
    });

    it('should merge includeDirectories from all scopes', () => {
      const systemSettingsContent = {
        context: { includeDirectories: ['/system/dir'] },
      };
      const systemDefaultsContent = {
        context: { includeDirectories: ['/system/defaults/dir'] },
      };
      const userSettingsContent = {
        context: { includeDirectories: ['/user/dir1', '/user/dir2'] },
      };
      const workspaceSettingsContent = {
        context: { includeDirectories: ['/workspace/dir'] },
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(systemDefaultsPath), { recursive: true });
      fs.writeFileSync(
        systemDefaultsPath,
        JSON.stringify(systemDefaultsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.merged.context?.includeDirectories).toEqual([
        '/system/defaults/dir',
        '/user/dir1',
        '/user/dir2',
        '/workspace/dir',
        '/system/dir',
      ]);
    });

    it('should handle JSON parsing errors gracefully', () => {
      const invalidJsonContent = 'invalid json';

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, invalidJsonContent);
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(workspaceSettingsPath, invalidJsonContent);

      try {
        loadSettings(tempWorkspaceDir);
        throw new Error('loadSettings should have thrown a FatalConfigError');
      } catch (e) {
        expect(e).toBeInstanceOf(FatalConfigError);
        const error = e as FatalConfigError;
        // The exact error message can vary between Node versions, so check for substrings.
        expect(error.message).toContain(`Error in ${userSettingsPath}`);
        expect(error.message).toContain(`Error in ${workspaceSettingsPath}`);
        expect(error.message).toContain(
          'Please fix the configuration file(s) and try again.',
        );
      }
    });

    it('should resolve environment variables in user settings', () => {
      process.env['TEST_API_KEY'] = 'user_api_key_from_env';
      const userSettingsContent: TestSettings = {
        apiKey: '$TEST_API_KEY',
        someUrl: 'https://test.com/${TEST_API_KEY}',
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));

      const settings = loadSettings(tempWorkspaceDir);
      expect((settings.user.settings as TestSettings)['apiKey']).toBe(
        'user_api_key_from_env',
      );
      expect((settings.user.settings as TestSettings)['someUrl']).toBe(
        'https://test.com/user_api_key_from_env',
      );
      expect((settings.merged as TestSettings)['apiKey']).toBe(
        'user_api_key_from_env',
      );
      delete process.env['TEST_API_KEY'];
    });

    it('should resolve environment variables in workspace settings', () => {
      process.env['WORKSPACE_ENDPOINT'] = 'workspace_endpoint_from_env';
      const workspaceSettingsContent: TestSettings = {
        endpoint: '${WORKSPACE_ENDPOINT}/api',
        nested: { value: '$WORKSPACE_ENDPOINT' },
      };
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);
      expect((settings.workspace.settings as TestSettings)['endpoint']).toBe(
        'workspace_endpoint_from_env/api',
      );
      const nested = (settings.workspace.settings as TestSettings)[
        'nested'
      ] as Record<string, unknown>;
      expect(nested['value']).toBe('workspace_endpoint_from_env');
      expect((settings.merged as TestSettings)['endpoint']).toBe(
        'workspace_endpoint_from_env/api',
      );
      delete process.env['WORKSPACE_ENDPOINT'];
    });

    it('should correctly resolve and merge env variables from different scopes', () => {
      process.env['SYSTEM_VAR'] = 'system_value';
      process.env['USER_VAR'] = 'user_value';
      process.env['WORKSPACE_VAR'] = 'workspace_value';
      process.env['SHARED_VAR'] = 'final_value';

      const systemSettingsContent: TestSettings = {
        configValue: '$SHARED_VAR',
        systemOnly: '$SYSTEM_VAR',
      };
      const userSettingsContent: TestSettings = {
        configValue: '$SHARED_VAR',
        userOnly: '$USER_VAR',
        ui: {
          theme: 'dark',
        },
      };
      const workspaceSettingsContent: TestSettings = {
        configValue: '$SHARED_VAR',
        workspaceOnly: '$WORKSPACE_VAR',
        ui: {
          theme: 'light',
        },
      };

      fs.mkdirSync(path.dirname(systemSettingsPath), { recursive: true });
      fs.writeFileSync(
        systemSettingsPath,
        JSON.stringify(systemSettingsContent),
      );
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      // Check resolved values in individual scopes
      expect((settings.system.settings as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect((settings.system.settings as TestSettings)['systemOnly']).toBe(
        'system_value',
      );
      expect((settings.user.settings as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect((settings.user.settings as TestSettings)['userOnly']).toBe(
        'user_value',
      );
      expect((settings.workspace.settings as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect(
        (settings.workspace.settings as TestSettings)['workspaceOnly'],
      ).toBe('workspace_value');

      // Check merged values (system > workspace > user)
      expect((settings.merged as TestSettings)['configValue']).toBe(
        'final_value',
      );
      expect((settings.merged as TestSettings)['systemOnly']).toBe(
        'system_value',
      );
      expect((settings.merged as TestSettings)['userOnly']).toBe('user_value');
      expect((settings.merged as TestSettings)['workspaceOnly']).toBe(
        'workspace_value',
      );
      expect(settings.merged.ui?.theme).toBe('light'); // workspace overrides user

      delete process.env['SYSTEM_VAR'];
      delete process.env['USER_VAR'];
      delete process.env['WORKSPACE_VAR'];
      delete process.env['SHARED_VAR'];
    });

    it('should correctly merge dnsResolutionOrder with workspace taking precedence', () => {
      const userSettingsContent = {
        advanced: { dnsResolutionOrder: 'ipv4first' },
      };
      const workspaceSettingsContent = {
        advanced: { dnsResolutionOrder: 'verbatim' },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.advanced?.dnsResolutionOrder).toBe('verbatim');
    });

    it('should use user dnsResolutionOrder if workspace is not defined', () => {
      const userSettingsContent = {
        advanced: { dnsResolutionOrder: 'verbatim' },
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.advanced?.dnsResolutionOrder).toBe('verbatim');
    });

    it('should leave unresolved environment variables as is', () => {
      const userSettingsContent: TestSettings = { apiKey: '$UNDEFINED_VAR' };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));

      const settings = loadSettings(tempWorkspaceDir);
      expect((settings.user.settings as TestSettings)['apiKey']).toBe(
        '$UNDEFINED_VAR',
      );
      expect((settings.merged as TestSettings)['apiKey']).toBe(
        '$UNDEFINED_VAR',
      );
    });

    it('should resolve multiple environment variables in a single string', () => {
      process.env['VAR_A'] = 'valueA';
      process.env['VAR_B'] = 'valueB';
      const userSettingsContent: TestSettings = {
        path: '/path/$VAR_A/${VAR_B}/end',
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      const settings = loadSettings(tempWorkspaceDir);
      expect((settings.user.settings as TestSettings)['path']).toBe(
        '/path/valueA/valueB/end',
      );
      delete process.env['VAR_A'];
      delete process.env['VAR_B'];
    });

    it('should resolve environment variables in arrays', () => {
      process.env['ITEM_1'] = 'item1_env';
      process.env['ITEM_2'] = 'item2_env';
      const userSettingsContent: TestSettings = {
        list: ['$ITEM_1', '${ITEM_2}', 'literal'],
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      const settings = loadSettings(tempWorkspaceDir);
      expect((settings.user.settings as TestSettings)['list']).toEqual([
        'item1_env',
        'item2_env',
        'literal',
      ]);
      delete process.env['ITEM_1'];
      delete process.env['ITEM_2'];
    });

    it('should correctly pass through null, boolean, and number types, and handle undefined properties', () => {
      process.env['MY_ENV_STRING'] = 'env_string_value';
      process.env['MY_ENV_STRING_NESTED'] = 'env_string_nested_value';

      const userSettingsContent: TestSettings = {
        nullVal: null,
        trueVal: true,
        falseVal: false,
        numberVal: 123.45,
        stringVal: '$MY_ENV_STRING',
        nestedObj: {
          nestedNull: null,
          nestedBool: true,
          nestedNum: 0,
          nestedString: 'literal',
          anotherEnv: '${MY_ENV_STRING_NESTED}',
        },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));

      const settings = loadSettings(tempWorkspaceDir);

      expect((settings.user.settings as TestSettings)['nullVal']).toBeNull();
      expect((settings.user.settings as TestSettings)['trueVal']).toBe(true);
      expect((settings.user.settings as TestSettings)['falseVal']).toBe(false);
      expect((settings.user.settings as TestSettings)['numberVal']).toBe(
        123.45,
      );
      expect((settings.user.settings as TestSettings)['stringVal']).toBe(
        'env_string_value',
      );
      expect(
        (settings.user.settings as TestSettings)['undefinedVal'],
      ).toBeUndefined();

      const nestedObj = (settings.user.settings as TestSettings)[
        'nestedObj'
      ] as Record<string, unknown>;
      expect(nestedObj['nestedNull']).toBeNull();
      expect(nestedObj['nestedBool']).toBe(true);
      expect(nestedObj['nestedNum']).toBe(0);
      expect(nestedObj['nestedString']).toBe('literal');
      expect(nestedObj['anotherEnv']).toBe('env_string_nested_value');

      delete process.env['MY_ENV_STRING'];
      delete process.env['MY_ENV_STRING_NESTED'];
    });

    it('should resolve multiple concatenated environment variables in a single string value', () => {
      process.env['TEST_HOST'] = 'myhost';
      process.env['TEST_PORT'] = '9090';
      const userSettingsContent: TestSettings = {
        serverAddress: '${TEST_HOST}:${TEST_PORT}/api',
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));

      const settings = loadSettings(tempWorkspaceDir);
      expect((settings.user.settings as TestSettings)['serverAddress']).toBe(
        'myhost:9090/api',
      );

      delete process.env['TEST_HOST'];
      delete process.env['TEST_PORT'];
    });

    describe('when GEMINI_CLI_SYSTEM_SETTINGS_PATH is set', () => {
      let MOCK_ENV_SYSTEM_SETTINGS_PATH: string;
      let tempSystemPathDir: string;

      beforeEach(() => {
        tempSystemPathDir = fs.mkdtempSync(
          path.join(osActual.tmpdir(), 'gemini-test-system-path-'),
        );
        MOCK_ENV_SYSTEM_SETTINGS_PATH = path.join(
          tempSystemPathDir,
          'settings.json',
        );
        process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] =
          MOCK_ENV_SYSTEM_SETTINGS_PATH;
      });

      afterEach(() => {
        delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
        fs.rmSync(tempSystemPathDir, { recursive: true, force: true });
      });

      it('should load system settings from the path specified in the environment variable', () => {
        const systemSettingsContent = {
          ui: { theme: 'env-var-theme' },
          tools: { sandbox: true },
        };
        fs.mkdirSync(path.dirname(MOCK_ENV_SYSTEM_SETTINGS_PATH), {
          recursive: true,
        });
        fs.writeFileSync(
          MOCK_ENV_SYSTEM_SETTINGS_PATH,
          JSON.stringify(systemSettingsContent),
        );

        const settings = loadSettings(tempWorkspaceDir);

        expect(settings.system.path).toBe(MOCK_ENV_SYSTEM_SETTINGS_PATH);
        expect(settings.system.settings).toEqual(systemSettingsContent);
        expect(settings.merged).toEqual({
          ...systemSettingsContent,
        });
      });
    });
  });

  describe('excludedProjectEnvVars integration', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
      vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should exclude DEBUG and DEBUG_MODE from project .env files by default', () => {
      // Ensure we don't have conflicting env vars from the runner environment
      delete process.env['GEMINI_API_KEY'];

      // Create a workspace settings file with excludedProjectEnvVars
      const workspaceSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['DEBUG', 'DEBUG_MODE'] },
      };
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      // Create a .env file in the workspace
      const dotEnvPath = path.join(tempWorkspaceDir, '.env');
      fs.writeFileSync(
        dotEnvPath,
        'DEBUG=true\nDEBUG_MODE=1\nGEMINI_API_KEY=test-key',
      );

      // This will call loadEnvironment internally with the merged settings
      const settings = loadSettings(tempWorkspaceDir);

      // Verify the settings were loaded correctly
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'DEBUG_MODE',
      ]);

      // Verify that the correct env vars were loaded into the process
      expect(process.env['GEMINI_API_KEY']).toBe('test-key');
      expect(process.env['DEBUG']).toBeUndefined();
      expect(process.env['DEBUG_MODE']).toBeUndefined();
    });

    it('should respect custom excludedProjectEnvVars from user settings', () => {
      const userSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['NODE_ENV', 'DEBUG'] },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.user.settings.advanced?.excludedEnvVars).toEqual([
        'NODE_ENV',
        'DEBUG',
      ]);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'NODE_ENV',
        'DEBUG',
      ]);
    });

    it('should merge excludedProjectEnvVars with workspace taking precedence', () => {
      const userSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['DEBUG', 'NODE_ENV', 'USER_VAR'] },
      };
      const workspaceSettingsContent = {
        general: {},
        advanced: { excludedEnvVars: ['WORKSPACE_DEBUG', 'WORKSPACE_VAR'] },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.user.settings.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'USER_VAR',
      ]);
      expect(settings.workspace.settings.advanced?.excludedEnvVars).toEqual([
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
      expect(settings.merged.advanced?.excludedEnvVars).toEqual([
        'DEBUG',
        'NODE_ENV',
        'USER_VAR',
        'WORKSPACE_DEBUG',
        'WORKSPACE_VAR',
      ]);
    });
  });

  describe('with workspace trust', () => {
    it('should merge workspace settings when workspace is trusted', () => {
      const userSettingsContent = {
        ui: { theme: 'dark' },
        tools: { sandbox: false },
      };
      const workspaceSettingsContent = {
        tools: { sandbox: true },
        context: { fileName: 'WORKSPACE.md' },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);
      expect(settings.merged.tools?.sandbox).toBe(true);
      expect(settings.merged.context?.fileName).toBe('WORKSPACE.md');
      expect(settings.merged.ui?.theme).toBe('dark');
    });

    it('should NOT merge workspace settings when workspace is not trusted', () => {
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
      const userSettingsContent = {
        ui: { theme: 'dark' },
        tools: { sandbox: false },
        context: { fileName: 'USER.md' },
      };
      const workspaceSettingsContent = {
        tools: { sandbox: true },
        context: { fileName: 'WORKSPACE.md' },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const settings = loadSettings(tempWorkspaceDir);

      expect(settings.merged.tools?.sandbox).toBe(false); // User setting
      expect(settings.merged.context?.fileName).toBe('USER.md'); // User setting
      expect(settings.merged.ui?.theme).toBe('dark'); // User setting
    });
  });

  describe('migrateSettingsToV1', () => {
    it('should handle an empty object', () => {
      const v2Settings = {};
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({});
    });

    it('should migrate a simple v2 settings object to v1', () => {
      const v2Settings = {
        general: {
          preferredEditor: 'vscode',
          vimMode: true,
        },
        ui: {
          theme: 'dark',
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        preferredEditor: 'vscode',
        vimMode: true,
        theme: 'dark',
      });
    });

    it('should handle nested properties correctly', () => {
      const v2Settings = {
        security: {
          folderTrust: {
            enabled: true,
          },
          auth: {
            selectedType: 'oauth',
          },
        },
        advanced: {
          autoConfigureMemory: true,
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        folderTrust: true,
        selectedAuthType: 'oauth',
        autoConfigureMaxOldSpaceSize: true,
      });
    });

    it('should preserve mcpServers at the top level', () => {
      const v2Settings = {
        general: {
          preferredEditor: 'vscode',
        },
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        preferredEditor: 'vscode',
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
      });
    });

    it('should carry over unrecognized top-level properties', () => {
      const v2Settings = {
        general: {
          vimMode: false,
        },
        unrecognized: 'value',
        another: {
          nested: true,
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        vimMode: false,
        unrecognized: 'value',
        another: {
          nested: true,
        },
      });
    });

    it('should handle a complex object with mixed properties', () => {
      const v2Settings = {
        general: {
          disableAutoUpdate: true,
        },
        ui: {
          hideBanner: true,
          customThemes: {
            myTheme: {},
          },
        },
        model: {
          name: 'gemini-pro',
        },
        mcpServers: {
          'server-1': {
            command: 'node server.js',
          },
        },
        unrecognized: {
          should: 'be-preserved',
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({
        disableAutoUpdate: true,
        hideBanner: true,
        customThemes: {
          myTheme: {},
        },
        model: 'gemini-pro',
        mcpServers: {
          'server-1': {
            command: 'node server.js',
          },
        },
        unrecognized: {
          should: 'be-preserved',
        },
      });
    });

    it('should not migrate a v1 settings object', () => {
      const v1Settings = {
        preferredEditor: 'vscode',
        vimMode: true,
        theme: 'dark',
      };
      const migratedSettings = migrateSettingsToV1(v1Settings);
      expect(migratedSettings).toEqual({
        preferredEditor: 'vscode',
        vimMode: true,
        theme: 'dark',
      });
    });

    it('should migrate a full v2 settings object to v1', () => {
      const v2Settings: TestSettings = {
        general: {
          preferredEditor: 'code',
          vimMode: true,
        },
        ui: {
          theme: 'dark',
        },
        privacy: {
          usageStatisticsEnabled: false,
        },
        model: {
          name: 'gemini-pro',
        },
        context: {
          fileName: 'CONTEXT.md',
          includeDirectories: ['/src'],
        },
        tools: {
          sandbox: true,
          exclude: ['toolA'],
        },
        mcp: {
          allowed: ['server1'],
        },
        security: {
          folderTrust: {
            enabled: true,
          },
        },
        advanced: {
          dnsResolutionOrder: 'ipv4first',
          excludedEnvVars: ['SECRET'],
        },
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
        unrecognizedTopLevel: {
          value: 'should be preserved',
        },
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        preferredEditor: 'code',
        vimMode: true,
        theme: 'dark',
        usageStatisticsEnabled: false,
        model: 'gemini-pro',
        contextFileName: 'CONTEXT.md',
        includeDirectories: ['/src'],
        sandbox: true,
        excludeTools: ['toolA'],
        allowMCPServers: ['server1'],
        folderTrust: true,
        dnsResolutionOrder: 'ipv4first',
        excludedProjectEnvVars: ['SECRET'],
        mcpServers: {
          'my-server': {
            command: 'npm start',
          },
        },
        unrecognizedTopLevel: {
          value: 'should be preserved',
        },
      });
    });

    it('should handle partial v2 settings', () => {
      const v2Settings: TestSettings = {
        general: {
          vimMode: false,
        },
        ui: {},
        model: {
          name: 'gemini-2.5-pro',
        },
        unrecognized: 'value',
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        vimMode: false,
        model: 'gemini-2.5-pro',
        unrecognized: 'value',
      });
    });

    it('should handle settings with different data types', () => {
      const v2Settings: TestSettings = {
        general: {
          vimMode: false,
        },
        model: {
          maxSessionTurns: -1,
        },
        context: {
          includeDirectories: [],
        },
        security: {
          folderTrust: {
            enabled: undefined,
          },
        },
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        vimMode: false,
        maxSessionTurns: -1,
        includeDirectories: [],
        security: {
          folderTrust: {
            enabled: undefined,
          },
        },
      });
    });

    it('should preserve unrecognized top-level keys', () => {
      const v2Settings: TestSettings = {
        general: {
          vimMode: true,
        },
        customTopLevel: {
          a: 1,
          b: [2],
        },
        anotherOne: 'hello',
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        vimMode: true,
        customTopLevel: {
          a: 1,
          b: [2],
        },
        anotherOne: 'hello',
      });
    });

    it('should handle an empty v2 settings object', () => {
      const v2Settings = {};
      const v1Settings = migrateSettingsToV1(v2Settings);
      expect(v1Settings).toEqual({});
    });

    it('should correctly handle mcpServers at the top level', () => {
      const v2Settings: TestSettings = {
        mcpServers: {
          serverA: { command: 'a' },
        },
        mcp: {
          allowed: ['serverA'],
        },
      };

      const v1Settings = migrateSettingsToV1(v2Settings);

      expect(v1Settings).toEqual({
        mcpServers: {
          serverA: { command: 'a' },
        },
        allowMCPServers: ['serverA'],
      });
    });

    it('should correctly migrate customWittyPhrases', () => {
      const v2Settings: Partial<Settings> = {
        ui: {
          customWittyPhrases: ['test phrase'],
        },
      };
      const v1Settings = migrateSettingsToV1(v2Settings as Settings);
      expect(v1Settings).toEqual({
        customWittyPhrases: ['test phrase'],
      });
    });
  });

  describe('loadEnvironment', () => {
    function setup({
      isFolderTrustEnabled = true,
      isWorkspaceTrustedValue = true,
    }) {
      delete process.env['TESTTEST']; // reset

      vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);

      mocks.isWorkspaceTrusted.mockReturnValue({
        isTrusted: isWorkspaceTrustedValue,
        source: 'file',
      });

      const userSettingsContent: Settings = {
        ui: {
          theme: 'dark',
        },
        security: {
          folderTrust: {
            enabled: isFolderTrustEnabled,
          },
        },
        context: {
          fileName: 'USER_CONTEXT.md',
        },
      };
      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));

      const geminiEnvPath = path.join(tempWorkspaceDir, GEMINI_DIR, '.env');
      fs.mkdirSync(path.dirname(geminiEnvPath), { recursive: true });
      fs.writeFileSync(geminiEnvPath, 'TESTTEST=1234');
    }

    it('sets environment variables from .env files', () => {
      setup({ isFolderTrustEnabled: false, isWorkspaceTrustedValue: true });
      loadEnvironment(loadSettings(tempWorkspaceDir).merged);

      expect(process.env['TESTTEST']).toEqual('1234');
    });

    it('does not load env files from untrusted spaces', () => {
      setup({ isFolderTrustEnabled: true, isWorkspaceTrustedValue: false });
      loadEnvironment(loadSettings(tempWorkspaceDir).merged);

      expect(process.env['TESTTEST']).not.toEqual('1234');
    });
  });

  describe('needsMigration', () => {
    it('should return false for an empty object', () => {
      expect(needsMigration({})).toBe(false);
    });

    it('should return false for settings that are already in V2 format', () => {
      const v2Settings: Partial<Settings> = {
        ui: {
          theme: 'dark',
        },
        tools: {
          sandbox: true,
        },
      };
      expect(needsMigration(v2Settings)).toBe(false);
    });

    it('should return true for settings with a V1 key that needs to be moved', () => {
      const v1Settings = {
        theme: 'dark', // v1 key
      };
      expect(needsMigration(v1Settings)).toBe(true);
    });

    it('should return true for settings with a mix of V1 and V2 keys', () => {
      const mixedSettings = {
        theme: 'dark', // v1 key
        tools: {
          sandbox: true, // v2 key
        },
      };
      expect(needsMigration(mixedSettings)).toBe(true);
    });

    it('should return false for settings with only V1 keys that are the same in V2', () => {
      const v1Settings = {
        mcpServers: {},
        telemetry: {},
        extensions: [],
      };
      expect(needsMigration(v1Settings)).toBe(false);
    });

    it('should return true for settings with a mix of V1 keys that are the same in V2 and V1 keys that need moving', () => {
      const v1Settings = {
        mcpServers: {}, // same in v2
        theme: 'dark', // needs moving
      };
      expect(needsMigration(v1Settings)).toBe(true);
    });

    it('should return false for settings with unrecognized keys', () => {
      const settings = {
        someUnrecognizedKey: 'value',
      };
      expect(needsMigration(settings)).toBe(false);
    });

    it('should return false for settings with v2 keys and unrecognized keys', () => {
      const settings = {
        ui: { theme: 'dark' },
        someUnrecognizedKey: 'value',
      };
      expect(needsMigration(settings)).toBe(false);
    });
  });

  describe('migrateDeprecatedSettings', () => {
    beforeEach(() => {
      mocks.isWorkspaceTrusted.mockReturnValue({
        isTrusted: true,
        source: 'file',
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should migrate disabled extensions from user and workspace settings', () => {
      const userSettingsContent = {
        extensions: {
          disabled: ['user-ext-1', 'shared-ext'],
        },
      };
      const workspaceSettingsContent = {
        extensions: {
          disabled: ['workspace-ext-1', 'shared-ext'],
        },
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const loadedSettings = loadSettings(tempWorkspaceDir);
      const setValueSpy = vi.spyOn(loadedSettings, 'setValue');
      const extensionManager = new ExtensionManager({
        settings: loadedSettings.merged,
        workspaceDir: tempWorkspaceDir,
        requestConsent: vi.fn(),
        requestSetting: vi.fn(),
      });
      const mockDisableExtension = vi.spyOn(
        extensionManager,
        'disableExtension',
      );
      mockDisableExtension.mockImplementation(async () => {});

      migrateDeprecatedSettings(loadedSettings, extensionManager);

      // Check user settings migration
      expect(mockDisableExtension).toHaveBeenCalledWith(
        'user-ext-1',
        SettingScope.User,
      );
      expect(mockDisableExtension).toHaveBeenCalledWith(
        'shared-ext',
        SettingScope.User,
      );

      // Check workspace settings migration
      expect(mockDisableExtension).toHaveBeenCalledWith(
        'workspace-ext-1',
        SettingScope.Workspace,
      );
      expect(mockDisableExtension).toHaveBeenCalledWith(
        'shared-ext',
        SettingScope.Workspace,
      );

      // Check that setValue was called to remove the deprecated setting
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.User,
        'extensions',
        {
          disabled: undefined,
        },
      );
      expect(setValueSpy).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'extensions',
        {
          disabled: undefined,
        },
      );
    });

    it('should not do anything if there are no deprecated settings', () => {
      const userSettingsContent = {
        extensions: {
          enabled: ['user-ext-1'],
        },
      };
      const workspaceSettingsContent = {
        someOtherSetting: 'value',
      };

      fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
      fs.writeFileSync(userSettingsPath, JSON.stringify(userSettingsContent));
      fs.mkdirSync(path.dirname(workspaceSettingsPath), { recursive: true });
      fs.writeFileSync(
        workspaceSettingsPath,
        JSON.stringify(workspaceSettingsContent),
      );

      const loadedSettings = loadSettings(tempWorkspaceDir);
      const setValueSpy = vi.spyOn(loadedSettings, 'setValue');
      const extensionManager = new ExtensionManager({
        settings: loadedSettings.merged,
        workspaceDir: tempWorkspaceDir,
        requestConsent: vi.fn(),
        requestSetting: vi.fn(),
      });
      const mockDisableExtension = vi.spyOn(
        extensionManager,
        'disableExtension',
      );
      mockDisableExtension.mockImplementation(async () => {});

      migrateDeprecatedSettings(loadedSettings, extensionManager);

      expect(mockDisableExtension).not.toHaveBeenCalled();
      expect(setValueSpy).not.toHaveBeenCalled();
    });
  });

  describe('saveSettings', () => {
    it('should save settings using updateSettingsFilePreservingFormat', () => {
      const mockUpdateSettings = vi.mocked(updateSettingsFilePreservingFormat);
      const settingsPath = path.join(tempWorkspaceDir, 'settings.json');
      const settingsFile = {
        path: settingsPath,
        settings: { ui: { theme: 'dark' } },
        originalSettings: { ui: { theme: 'dark' } },
      } as unknown as SettingsFile;

      saveSettings(settingsFile);

      expect(mockUpdateSettings).toHaveBeenCalledWith(settingsPath, {
        ui: { theme: 'dark' },
      });
    });

    it('should create directory if it does not exist', () => {
      const settingsPath = path.join(
        tempWorkspaceDir,
        'new',
        'dir',
        'settings.json',
      );
      const settingsFile = {
        path: settingsPath,
        settings: {},
        originalSettings: {},
      } as unknown as SettingsFile;

      saveSettings(settingsFile);

      expect(fs.existsSync(path.dirname(settingsPath))).toBe(true);
      // We can't check for mkdirSync call directly because we are not spying on it anymore,
      // but checking if the directory exists is the real test.
    });

    it('should emit error feedback if saving fails', () => {
      const mockUpdateSettings = vi.mocked(updateSettingsFilePreservingFormat);
      const error = new Error('Write failed');
      mockUpdateSettings.mockImplementation(() => {
        throw error;
      });

      const settingsPath = path.join(tempWorkspaceDir, 'settings.json');
      const settingsFile = {
        path: settingsPath,
        settings: {},
        originalSettings: {},
      } as unknown as SettingsFile;

      saveSettings(settingsFile);

      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'There was an error saving your latest settings changes.',
        error,
      );
    });
  });
});
