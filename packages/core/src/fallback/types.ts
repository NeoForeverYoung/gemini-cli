/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines the intent returned by the UI layer during a fallback scenario.
 */
export type FallbackIntent =
  | 'retry' // Immediately retry the current request with the fallback model.
  | 'retry_once' // Retry now, but allow the original model to be retried next turn.
  | 'retry_always' // Retry now and stick with the fallback for future turns.
  | 'stop'; // Stop the current request (no immediate retry).

export interface FallbackHandlerOutcome {
  shouldRetry: boolean;
  intent: FallbackIntent;
  model?: string;
  restoreTo?: string;
}

/**
 * The interface for the handler provided by the UI layer (e.g., the CLI)
 * to interact with the user during a fallback scenario.
 */
import type { ModelSelectionResult } from '../availability/modelAvailabilityService.js';
import type {
  FailureKind,
  FallbackAction,
  ModelPolicy,
} from '../availability/modelPolicy.js';

export interface FallbackRecommendation extends ModelSelectionResult {
  action: FallbackAction;
  failureKind: FailureKind;
  failedPolicy?: ModelPolicy;
  selectedPolicy?: ModelPolicy;
  isLastResort?: boolean;
}

export type FallbackModelHandler = (
  failedModel: string,
  recommendation: FallbackRecommendation,
  error?: unknown,
) => Promise<FallbackIntent | null>;
