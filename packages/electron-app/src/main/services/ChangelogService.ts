/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { app } from 'electron';

export class ChangelogService {
  async getChangelog(): Promise<string> {
    try {
      let changelogPath: string;
      if (app.isPackaged) {
        changelogPath = path.join(
          process.resourcesPath,
          'docs',
          'changelogs',
          'index.md',
        );
      } else {
        // In dev, we are in packages/electron-app/dist/main/index.cjs (or similar)
        // We need to go up to the root.
        // process.cwd() is usually the package root in dev (packages/electron-app)
        changelogPath = path.resolve(
          process.cwd(),
          '../../docs/changelogs/index.md',
        );
      }

      const content = await fs.readFile(changelogPath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Failed to read changelog:', error);
      return 'Failed to load changelog.';
    }
  }
}
