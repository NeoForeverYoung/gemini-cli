/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExtensionInfo {
  name: string;
  version: string;
  description?: string;
  path: string;
  icon?: string;
}

export interface AvailableExtension {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  stars?: number;
  tags?: string[];
  icon?: string;
}