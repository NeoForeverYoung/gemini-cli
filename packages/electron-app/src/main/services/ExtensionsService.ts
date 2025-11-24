/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ExtensionStorage } from '@google/gemini-cli/dist/src/config/extensions/storage.js';
import { EXTENSIONS_CONFIG_FILENAME } from '@google/gemini-cli/dist/src/config/extensions/variables.js';
import { ExtensionManager } from '@google/gemini-cli/dist/src/config/extension-manager.js';
import { loadSettings } from '@google/gemini-cli/dist/src/config/settings.js';

export interface ExtensionInfo {
  name: string;
  version: string;
  description?: string;
  path: string;
}

export interface AvailableExtension {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  stars?: number;
  tags?: string[];
  icon?: string;
}

export class ExtensionsService {
  async getAvailableExtensions(): Promise<AvailableExtension[]> {
    try {
      const response = await fetch('https://geminicli.com/extensions.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch extensions: ${response.statusText}`);
      }
      const data = await response.json();

      if (!Array.isArray(data)) {
        return [];
      }

      return data.map((item: any) => ({
        id: item.id,
        name: item.extensionName || item.name || item.fullName.split('/')[1],
        description: item.extensionDescription || item.repoDescription,
        author: item.fullName.split('/')[0],
        version: item.extensionVersion || '0.0.0',
        stars: item.stars,
        icon: item.avatarUrl,
        tags: [
          item.hasMCP ? 'MCP' : null,
          item.hasContext ? 'Context' : null,
        ].filter(Boolean) as string[],
      }));
    } catch (error) {
      console.error('Error fetching available extensions:', error);
      return [];
    }
  }

  async getInstalledExtensions(): Promise<ExtensionInfo[]> {
    const extensionsDir = ExtensionStorage.getUserExtensionsDir();
    
    if (!fs.existsSync(extensionsDir)) {
      return [];
    }

    const extensions: ExtensionInfo[] = [];
    const subdirs = await fs.promises.readdir(extensionsDir);

    for (const subdir of subdirs) {
      const extensionDir = path.join(extensionsDir, subdir);
      const stat = await fs.promises.stat(extensionDir);
      
      if (stat.isDirectory()) {
        try {
          const configPath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
          if (fs.existsSync(configPath)) {
            const configContent = await fs.promises.readFile(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            
            if (config.name && config.version) {
              extensions.push({
                name: config.name,
                version: config.version,
                description: config.description,
                path: extensionDir,
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to load extension from ${extensionDir}:`, error);
        }
      }
    }

    return extensions;
  }

  async installExtension(source: string): Promise<void> {
    try {
      const workspaceDir = os.homedir();
      const { merged: settings } = await loadSettings(workspaceDir);
      
      // Mock consent and settings request for now
      // In a real implementation, we would use IPC to ask the user
      const requestConsent = async () => true;
      const requestSetting = async () => ''; // Default or fail

      const extensionManager = new ExtensionManager({
        workspaceDir,
        settings,
        requestConsent,
        requestSetting,
      });

      await extensionManager.loadExtensions();

      let installMetadata: any; // Using any to bypass strict type checks against CLI types for now
      if (
        source.startsWith('http://') ||
        source.startsWith('https://') ||
        source.startsWith('git@') ||
        source.startsWith('sso://')
      ) {
        installMetadata = {
          source,
          type: 'git',
        };
      } else {
        installMetadata = {
          source,
          type: 'local',
        };
      }

      await extensionManager.installOrUpdateExtension(installMetadata);
    } catch (error) {
      console.error('Failed to install extension:', error);
      throw error;
    }
  }

  async uninstallExtension(name: string): Promise<void> {
    try {
      const workspaceDir = os.homedir();
      const { merged: settings } = await loadSettings(workspaceDir);
      
      const requestConsent = async () => true;
      const requestSetting = async () => '';

      const extensionManager = new ExtensionManager({
        workspaceDir,
        settings,
        requestConsent,
        requestSetting,
      });

      await extensionManager.loadExtensions();
      await extensionManager.uninstallExtension(name, false);
    } catch (error) {
      console.error('Failed to uninstall extension:', error);
      throw error;
    }
  }
}
