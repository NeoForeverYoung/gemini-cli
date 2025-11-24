/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { McpServers } from '../types/mcp';

export function useMcpServers() {
  const [servers, setServers] = useState<McpServers>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        setIsLoading(true);
        const result = await window.electron.mcp.getServers();
        setServers(result);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServers();
  }, []);

  return { servers, isLoading, error };
}
