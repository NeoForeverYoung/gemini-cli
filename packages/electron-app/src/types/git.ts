/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GitFileStatus {
  path: string;
  added: number;
  deleted: number;
  status: 'M' | 'A' | 'D' | '??' | 'R' | 'C' | 'U';
  stagedStatus: string;
  unstagedStatus: string;
}

export interface FileDiff {
  oldContent: string;
  newContent: string;
}

export interface WorkspaceGitStatus {
  path: string;
  branch?: string;
  totalAdded: number;
  totalDeleted: number;
  files: GitFileStatus[];
}
