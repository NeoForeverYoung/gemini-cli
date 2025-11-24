/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { ExtensionInfo } from '../types/extensions';

export function useExtensions() {
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchExtensions = async () => {
    try {
      setIsLoading(true);
      const [installed, available] = await Promise.all([
        window.electron.extensions.getList(),
        window.electron.extensions.getAvailable().catch(() => []),
      ]);

      const merged = installed.map((ext) => {
        const match = available.find((a) => a.name === ext.name);
        return match ? { ...ext, icon: match.icon } : ext;
      });

      setExtensions(merged);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExtensions();
  }, []);

  return { extensions, isLoading, error, refresh: fetchExtensions };
}
