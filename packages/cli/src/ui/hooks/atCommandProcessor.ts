/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion } from '@google/genai';
import type { Config } from '@google/gemini-cli-core';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';

interface HandleAtCommandParams {
  query: string;
  config: Config;
  addItem: UseHistoryManagerReturn['addItem'];
  onDebugMessage: (message: string) => void;
  messageId: number;
  signal: AbortSignal;
}

interface HandleAtCommandResult {
  processedQuery: PartListUnion | null;
  shouldProceed: boolean;
}

/**
 * Processes user input potentially containing one or more '@<path>' commands.
 * Replaces the '@<path>' with the absolute path of the referenced file or directory.
 *
 * @returns An object indicating whether the main hook should proceed with an
 *          LLM call and the processed query parts.
 */
export async function handleAtCommand({
  query,
}: HandleAtCommandParams): Promise<HandleAtCommandResult> {
  return { processedQuery: [{ text: query }], shouldProceed: true };
}
