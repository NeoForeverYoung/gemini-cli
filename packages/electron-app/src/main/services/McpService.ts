/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import type { CliSettings } from '../config/types';

export class McpService {
  async getConfiguredServers(): Promise<Record<string, unknown>> {
    const { loadSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    const settings = await loadSettings(os.homedir());
    const merged = settings.merged as CliSettings;

    return (merged.mcpServers as Record<string, unknown>) || {};
  }
}
