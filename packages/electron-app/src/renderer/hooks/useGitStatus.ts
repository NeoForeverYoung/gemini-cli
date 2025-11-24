/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { WorkspaceGitStatus } from '../../types/git';

export function useGitStatus(workspacePaths: string[]) {
  const [statuses, setStatuses] = useState<Record<string, WorkspaceGitStatus>>(
    {},
  );

  useEffect(() => {
    // Tell main process to watch these paths
    window.electron.git.watchWorkspaces(workspacePaths);

    // Listen for updates
    const removeListener = window.electron.git.onStatusUpdate(
      (_event, status) => {
        setStatuses((prev) => ({
          ...prev,
          [status.path]: status,
        }));
      },
    );

    return () => {
      removeListener();
    };
  }, [workspacePaths]); // Array reference might change, but we rely on React to handle it or we should use a stable key.
  // If workspacePaths is a new array every render, this will loop.
  // In App.tsx, `workspaces` is memoized. `workspacePaths` should be derived from it.

  return statuses;
}
