/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelPolicy, ModelPolicyChain } from './modelPolicy.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../config/models.js';
import { UserTierId } from '../code_assist/types.js';
import { debugLogger } from '../utils/debugLogger.js';

function clonePolicy(policy: ModelPolicy): ModelPolicy {
  return { ...policy };
}

function cloneChain(chain: ModelPolicyChain): ModelPolicyChain {
  return chain.map(clonePolicy);
}

const BASE_POLICY_PRO: ModelPolicy = {
  model: DEFAULT_GEMINI_MODEL,
  onTerminalError: 'prompt',
  onTransientError: 'prompt',
  onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE',
  onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN',
};

const BASE_POLICY_FLASH: ModelPolicy = {
  model: DEFAULT_GEMINI_FLASH_MODEL,
  onTerminalError: 'prompt',
  onTransientError: 'prompt',
  onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE',
  onRetryFailureState: 'MARK_PERMANENTLY_UNAVAILABLE',
};

 
const BASE_POLICY_FLASH_LITE: ModelPolicy = {
  model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
  onTerminalError: 'prompt',
  onTransientError: 'prompt',
  onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE',
  onRetryFailureState: 'MARK_PERMANENTLY_UNAVAILABLE',
  isLastResort: true,
};

const PAID_CHAIN: ModelPolicyChain = [
  BASE_POLICY_PRO,
  BASE_POLICY_FLASH,
  BASE_POLICY_FLASH_LITE,
];

const FREE_CHAIN: ModelPolicyChain = [BASE_POLICY_PRO, BASE_POLICY_FLASH];

/**
 * Returns the default ordered model policy chain for the supplied tier.
 * Currently both paid and free tiers share the same chain, but this helper
 * centralises the ordering so chains/policies (e.g. adding flash lite) can be introduced via
 * simple edits in one location.
 */
export function getDefaultPolicyChainForTier(
  tier?: UserTierId,
): ModelPolicyChain {
  debugLogger.log('[policyCatalog] resolving default chain for tier:', tier);
  switch (tier) {
    case UserTierId.FREE:
      debugLogger.log('[policyCatalog] using free-tier policy chain');
      return cloneChain(FREE_CHAIN);
    case UserTierId.LEGACY:
    case UserTierId.STANDARD:
    default:
      debugLogger.log('[policyCatalog] using paid-tier policy chain');
      return cloneChain(PAID_CHAIN);
  }
}

/**
 * Provides a default policy scaffold for models not present in the catalog.
 */
export function createDefaultPolicy(model: string): ModelPolicy {
  debugLogger.log(
    '[policyCatalog] creating default policy scaffold for model:',
    model,
  );
  return {
    model,
    onTerminalError: 'prompt',
    onTransientError: 'prompt',
    onTerminalErrorState: 'MARK_PERMANENTLY_UNAVAILABLE',
    onRetryFailureState: 'MARK_UNAVAILABLE_FOR_TURN',
  };
}
