/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageBusPlugin } from './message-bus-plugin.js';
import { CoreToolScheduler } from '../core/coreToolScheduler.js';
import { MessageBus } from './message-bus.js';
import type { Config } from '../config/config.js';
import {
  type AnyDeclarativeTool,
  type ToolCallConfirmationDetails,
} from '../tools/tools.js';
import { ApprovalMode, PolicyDecision } from '../policy/types.js';
import { MessageBusType } from './types.js';
import { AdkToolAdapter } from '../tools/tools.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import type { ToolContext } from '@google/adk';

describe('ADK Tool Confirmation Flow', () => {
  let messageBus: MessageBus;
  let config: Config;
  let scheduler: CoreToolScheduler;
  let plugin: MessageBusPlugin;
  let onToolCallsUpdate: ReturnType<typeof vi.fn>;
  let onAllToolCallsComplete: ReturnType<typeof vi.fn>;
  let policyEngine: PolicyEngine;

  beforeEach(() => {
    policyEngine = {
      check: vi.fn().mockResolvedValue({ decision: PolicyDecision.ASK_USER }),
    } as unknown as PolicyEngine;

    messageBus = new MessageBus(policyEngine);
    config = {
      getAdkMode: () => true,
      getEnableMessageBusIntegration: () => true,
      getMessageBus: () => messageBus,
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getToolRegistry: () => ({
        getAllToolNames: () => [],
        getTool: () => undefined,
      }),
    } as unknown as Config;

    onToolCallsUpdate = vi.fn();
    onAllToolCallsComplete = vi.fn();

    scheduler = new CoreToolScheduler({
      config,
      onToolCallsUpdate,
      onAllToolCallsComplete,
      getPreferredEditor: () => undefined,
      onEditorClose: () => {},
    });
    // Ensure scheduler is used to avoid unused variable error
    expect(scheduler).toBeDefined();

    plugin = new MessageBusPlugin(messageBus, config);
  });

  it('should update scheduler status on tool confirmation and completion', async () => {
    const tool = {
      name: 'testTool',
      build: () => ({
        shouldConfirmExecute: async () =>
          ({
            type: 'info',
            title: 'Confirm',
            prompt: 'Do it?',
            onConfirm: async () => {},
          }) as ToolCallConfirmationDetails,
      }),
    } as unknown as AnyDeclarativeTool;

    const adkTool = new AdkToolAdapter(tool);
    const toolArgs = { foo: 'bar' };
    const toolContext = {} as unknown as ToolContext;

    // 1. Trigger tool execution (simulating ADK runner)
    const beforePromise = plugin.beforeToolCallback({
      tool: adkTool,
      toolArgs,
      toolContext,
    });

    // 2. Verify scheduler received confirmation request
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onToolCallsUpdate).toHaveBeenCalled();
    const waitingCalls = onToolCallsUpdate.mock.calls[0][0];
    expect(waitingCalls).toHaveLength(1);
    expect(waitingCalls[0].status).toBe('awaiting_approval');
    const correlationId = waitingCalls[0].request.callId;
    expect(correlationId).toBeDefined();

    // 3. Confirm the tool
    messageBus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: true,
    });

    await beforePromise;

    // 4. Simulate tool completion
    await plugin.afterToolCallback({
      tool: adkTool,
      toolArgs,
      toolContext,
      result: { output: 'done' },
    });

    // 5. Verify scheduler received success update
    const lastCall = onToolCallsUpdate.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(lastCall).toHaveLength(1);
    expect(lastCall[0].status).toBe('success');
    expect(lastCall[0].request.callId).toBe(correlationId);

    // 6. Verify onAllToolCallsComplete was called
    expect(onAllToolCallsComplete).toHaveBeenCalledWith([lastCall[0]]);
  });

  it('should update scheduler status on tool failure', async () => {
    const tool = {
      name: 'testTool',
      build: () => ({
        shouldConfirmExecute: async () =>
          ({
            type: 'info',
            title: 'Confirm',
            prompt: 'Do it?',
            onConfirm: async () => {},
          }) as ToolCallConfirmationDetails,
      }),
    } as unknown as AnyDeclarativeTool;

    const adkTool = new AdkToolAdapter(tool);
    const toolArgs = { foo: 'bar' };
    const toolContext = {} as unknown as ToolContext;

    // 1. Trigger tool execution
    const beforePromise = plugin.beforeToolCallback({
      tool: adkTool,
      toolArgs,
      toolContext,
    });

    // 2. Verify scheduler received confirmation request
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onToolCallsUpdate).toHaveBeenCalled();
    const waitingCalls = onToolCallsUpdate.mock.calls[0][0];
    const correlationId = waitingCalls[0].request.callId;

    // 3. Confirm the tool
    messageBus.publish({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: true,
    });

    await beforePromise;

    // 4. Simulate tool failure
    const error = new Error('Something went wrong');
    await plugin.onToolErrorCallback({
      tool: adkTool,
      toolArgs,
      toolContext,
      error,
    });

    // 5. Verify scheduler received error update
    const lastCall = onToolCallsUpdate.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(lastCall).toHaveLength(1);
    expect(lastCall[0].status).toBe('error');
    expect(lastCall[0].request.callId).toBe(correlationId);
    expect(lastCall[0].response.error).toBe(error);

    // 6. Verify onAllToolCallsComplete was called
    expect(onAllToolCallsComplete).toHaveBeenCalledWith([lastCall[0]]);
  });
});
