/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  httpUrl?: string;
  tcp?: string;
  description?: string;
  trust?: boolean;
  [key: string]: unknown;
}

export interface McpServers {
  [name: string]: McpServerConfig;
}
