/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Session {
  tag: string;
  projectPath: string;
  mtime: string; // ISO string
  hash: string;
}
