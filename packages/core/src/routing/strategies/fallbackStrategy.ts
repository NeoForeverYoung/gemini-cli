/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from '../routingStrategy.js';
import { DEFAULT_GEMINI_MODEL_AUTO } from '../../config/models.js';

export class FallbackStrategy implements RoutingStrategy {
  readonly name = 'fallback';

  async route(
    _context: RoutingContext,
    config: Config,
    _baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const preferredModel = config.getModel();
    const activeModel = config.getActiveModel();

    if (
      preferredModel === DEFAULT_GEMINI_MODEL_AUTO ||
      activeModel === preferredModel
    ) {
      return null;
    }
    return {
      model: activeModel,
      metadata: {
        source: this.name,
        latencyMs: 0,
        reasoning: `Active model differs from preferred (${preferredModel}); using fallback: ${activeModel}`,
      },
    };
  }
}
