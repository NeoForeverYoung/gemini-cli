/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IDE_DEFINITIONS,
  detectIdeFromEnv,
  isCloudShell,
} from '../ide/detect-ide.js';

/**
 * Determine the surface that the user is currently using.  Surface is effectively the
 * distribution channel in which the user is using Gemini CLI.  Gemini CLI comes bundled
 * w/ Firebase Studio and Cloud Shell.  Users that manually download themselves will
 * likely be "SURFACE_NOT_SET".
 *
 * This is computed based upon a series of environment variables these distribution
 * methods might have in their runtimes.
 */
export function determineSurface(): string {
  if (process.env['SURFACE']) {
    return process.env['SURFACE'];
  } else if (isCloudShell()) {
    return IDE_DEFINITIONS.cloudshell.name;
  } else if (process.env['GITHUB_SHA']) {
    return 'GitHub';
  } else if (process.env['TERM_PROGRAM'] === 'vscode') {
    return detectIdeFromEnv().name || IDE_DEFINITIONS.vscode.name;
  } else {
    return 'SURFACE_NOT_SET';
  }
}
