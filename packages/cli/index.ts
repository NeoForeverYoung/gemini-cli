#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './src/gemini.js';
import { main } from './src/gemini.js';
import { FatalError, writeToStderr } from '@google/gemini-cli-core';
import { runExitCleanup } from './src/utils/cleanup.js';

export {
  loadSettings,
  saveSettings,
  SettingScope,
  type Settings,
} from './src/config/settings.js';
export {
  themeManager,
  type ThemeDisplay,
} from './src/ui/themes/theme-manager.js';
export {
  getSettingsSchema,
  type SettingsSchema,
  type SettingDefinition,
  type SettingEnumOption,
} from './src/config/settingsSchema.js';

// --- Global Entry Point ---
main().catch(async (error) => {
  await runExitCleanup();

  if (error instanceof FatalError) {
    let errorMessage = error.message;
    if (!process.env['NO_COLOR']) {
      errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
    }
    writeToStderr(errorMessage + '\n');
    process.exit(error.exitCode);
  }
  writeToStderr('An unexpected critical error occurred:');
  if (error instanceof Error) {
    writeToStderr(error.stack + '\n');
  } else {
    writeToStderr(String(error) + '\n');
  }
  process.exit(1);
});
