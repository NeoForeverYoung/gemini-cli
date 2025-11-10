/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelId } from './modelAvailabilityService.js';

export type FallbackAction = 'silent' | 'prompt';

export type AvailabilityStateDirective =
  | 'MARK_PERMANENTLY_UNAVAILABLE'
  | 'MARK_UNAVAILABLE_FOR_TURN';

export interface ModelPolicy {
  model: ModelId;
  onTerminalError: FallbackAction;
  onTransientError: FallbackAction;
  isLastResort?: boolean;
  onTerminalErrorState: AvailabilityStateDirective;
  onRetryFailureState: AvailabilityStateDirective;
}

export type ModelPolicyChain = ModelPolicy[];

export type FailureKind = 'terminal' | 'transient' | 'unknown';
