/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { AvailabilityStateDirective } from './modelPolicy.js';

export type ModelId = string;

export type AvailabilityReason =
  | 'quota'
  | 'capacity'
  | 'unavailable_for_turn'
  | 'unknown';

interface HealthState {
  status: 'terminal' | 'turn';
  reason: AvailabilityReason;
}

export interface ModelAvailabilitySnapshot {
  available: boolean;
  reason?: AvailabilityReason;
}

export interface ModelSelectionResult {
  selected: ModelId | null;
  skipped: Array<{
    model: ModelId;
    reason: AvailabilityReason;
  }>;
}

type TerminalReason = Exclude<AvailabilityReason, 'unavailable_for_turn'>;

export class ModelAvailabilityService {
  private readonly health = new Map<ModelId, HealthState>();
  private readonly emitter = new EventEmitter();

  applyAvailabilityDirective({
    model,
    directive,
    reason,
  }: {
    model: ModelId;
    directive: AvailabilityStateDirective;
    reason?: TerminalReason;
  }) {
    switch (directive) {
      case 'MARK_PERMANENTLY_UNAVAILABLE':
        this.markTerminal(model, reason ?? 'unknown');
        break;
      case 'MARK_UNAVAILABLE_FOR_TURN':
        this.markUnavailableForTurn(model);
        break;
      default:
        break;
    }
  }

  markTerminal(model: ModelId, reason: TerminalReason) {
    this.setState(model, {
      status: 'terminal',
      reason,
    });
  }

  markHealthy(model: ModelId, reason?: AvailabilityReason) {
    this.clearState(model, { restorationReason: reason });
  }

  markUnavailableForTurn(model: ModelId) {
    this.setState(model, {
      status: 'turn',
      reason: 'unavailable_for_turn',
    });
  }

  snapshot(model: ModelId): ModelAvailabilitySnapshot {
    const state = this.normalizeState(model);
    if (!state) {
      return { available: true };
    }

    return {
      available: false,
      reason: state.reason,
    };
  }

  selectFirstAvailable(models: ModelId[]): ModelSelectionResult {
    const skipped: ModelSelectionResult['skipped'] = [];

    for (const model of models) {
      const snapshot = this.snapshot(model);
      if (snapshot.available) {
        return { selected: model, skipped };
      }
      skipped.push({
        model,
        reason: snapshot.reason ?? 'unknown',
      });
    }

    return { selected: null, skipped };
  }

  on(
    event: 'healthChanged',
    listener: (model: ModelId, snapshot: ModelAvailabilitySnapshot) => void,
  ) {
    this.emitter.on(event, listener);
  }

  private setState(model: ModelId, nextState: HealthState) {
    this.health.set(model, nextState);
    const snapshot = this.snapshot(model);
    if (snapshot.available) {
      // `snapshot` may clear the state if it expired immediately.
      return;
    }
    this.emitter.emit('healthChanged', model, snapshot);
  }

  private clearState(
    model: ModelId,
    options?: { restorationReason?: AvailabilityReason },
  ) {
    const hadState = this.health.delete(model);
    if (hadState) {
      this.emitter.emit('healthChanged', model, {
        available: true,
        reason: options?.restorationReason,
      });
    }
  }

  private normalizeState(model: ModelId): HealthState | undefined {
    const state = this.health.get(model);
    if (!state) return undefined;

    return state;
  }

  resetTurn() {
    for (const [model, state] of this.health.entries()) {
      if (state.status === 'turn') {
        this.clearState(model);
      }
    }
  }
}
