/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { LlmAgent } from '@google/adk';
import { createAdkAgent } from '../agents/adk-factory.js';
import type { AgentDefinition } from '../agents/types.js';

vi.mock('@google/adk', () => ({
  LlmAgent: vi.fn(),
}));

vi.mock('../agents/adk-factory.js', () => ({
  createAdkAgent: vi.fn(),
}));

vi.mock('../confirmation-bus/message-bus-plugin.js', () => ({
  MessageBusPlugin: vi.fn(),
}));

vi.mock('./geminiRequest.js', () => ({
  partListUnionToString: vi.fn(),
}));

describe('GeminiChat ADK Integration', () => {
  let mockConfig: Config;
  let mockToolRegistry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();

    mockToolRegistry = {
      getAllTools: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;

    mockConfig = {
      getAdkMode: vi.fn().mockReturnValue(true),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getAgentRegistry: vi.fn().mockReturnValue({
        getAllDefinitions: vi
          .fn()
          .mockReturnValue([
            { name: 'subagent1' } as AgentDefinition,
            { name: 'subagent2' } as AgentDefinition,
          ]),
      }),
      getMessageBus: vi.fn(),
      getContentGeneratorConfig: vi.fn().mockReturnValue({}),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize LlmAgent with subagents from registry', async () => {
    const mockSubAgent1 = { name: 'mockSubAgent1' };
    const mockSubAgent2 = { name: 'mockSubAgent2' };

    vi.mocked(createAdkAgent)
      .mockReturnValueOnce(mockSubAgent1 as unknown as LlmAgent)
      .mockReturnValueOnce(mockSubAgent2 as unknown as LlmAgent);

    new GeminiChat(mockConfig, {}, mockToolRegistry);

    // Verify createAdkAgent was called for each definition
    expect(createAdkAgent).toHaveBeenCalledTimes(2);
    expect(createAdkAgent).toHaveBeenCalledWith(
      mockConfig,
      { name: 'subagent1' },
      mockToolRegistry,
    );
    expect(createAdkAgent).toHaveBeenCalledWith(
      mockConfig,
      { name: 'subagent2' },
      mockToolRegistry,
    );

    // Verify LlmAgent was initialized with subAgents
    expect(LlmAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        subAgents: [mockSubAgent1, mockSubAgent2],
      }),
    );
  });
});
