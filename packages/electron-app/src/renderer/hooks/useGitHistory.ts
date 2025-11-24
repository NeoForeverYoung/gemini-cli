/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export function useGitHistory(cwd?: string) {
  const [history, setHistory] = useState<GitCommit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!cwd) {
      setHistory([]);
      return;
    }

    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        const data = await window.electron.git.getHistory(cwd);
        setHistory(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [cwd]);

  return { history, isLoading, error };
}
