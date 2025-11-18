/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LlmAgent } from '@google/adk';
import type { z } from 'zod';
import type { Config } from '../config/config.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import {
  type AnyDeclarativeTool,
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from '../tools/tools.js';
import { DeclarativeToAdkAdapter } from '../tools/adapters.js';
import type { AgentDefinition } from './types.js';
import { convertInputConfigToGenaiSchema } from './schema-converter.js';
import { TASK_COMPLETE_TOOL_NAME } from './executor.js';
import { Type, type FunctionDeclaration, type Schema } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

/**
 * Creates an ADK LlmAgent from an AgentDefinition.
 */
export function createAdkAgent<TOutput extends z.ZodTypeAny>(
  config: Config,
  definition: AgentDefinition<TOutput>,
  toolRegistry: ToolRegistry,
): LlmAgent {
  const tools = prepareTools(config, definition, toolRegistry);
  const { name, description, modelConfig } = definition;

  const model =
    modelConfig?.model ||
    (config.getModel() === 'auto' ? DEFAULT_GEMINI_MODEL : config.getModel());

  const resolvedConfig = config.modelConfigService.getResolvedConfig({ model });
  const genConfig = resolvedConfig.generateContentConfig;

  return new LlmAgent({
    name,
    description,
    instruction: definition.promptConfig.systemPrompt,
    model,
    tools,
    generateContentConfig: {
      temperature: modelConfig?.temp ?? genConfig.temperature,
      topP: modelConfig?.top_p ?? genConfig.topP,
      topK: genConfig.topK,
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget:
          modelConfig?.thinkingBudget ??
          genConfig.thinkingConfig?.thinkingBudget ??
          -1,
      },
    },
    inputSchema: convertInputConfigToGenaiSchema(definition.inputConfig),
  });
}

function prepareTools<TOutput extends z.ZodTypeAny>(
  config: Config,
  definition: AgentDefinition<TOutput>,
  toolRegistry: ToolRegistry,
): DeclarativeToAdkAdapter[] {
  const messageBus = config.getMessageBus();
  const { toolConfig, outputConfig } = definition;
  const toolsList: DeclarativeToAdkAdapter[] = [];

  if (toolConfig) {
    const toolNamesToLoad: string[] = [];
    for (const toolRef of toolConfig.tools) {
      if (typeof toolRef === 'string') {
        toolNamesToLoad.push(toolRef);
      } else {
        toolsList.push(
          new DeclarativeToAdkAdapter(toolRef as AnyDeclarativeTool),
        );
      }
    }
    toolsList.push(
      ...toolRegistry
        .getAllTools()
        .filter((tool) => toolNamesToLoad.includes(tool.name))
        .map((tool) => new DeclarativeToAdkAdapter(tool)),
    );
  }

  const completeTool = {
    name: TASK_COMPLETE_TOOL_NAME,
    description: outputConfig
      ? 'Call this tool to submit your final answer and complete the task. This is the ONLY way to finish.'
      : 'Call this tool to signal that you have completed your task. This is the ONLY way to finish.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: [],
    },
  };

  if (outputConfig) {
    const jsonSchema = zodToJsonSchema(outputConfig.schema);
    const { properties, required } = jsonSchema as {
      properties?: Record<string, Schema>;
      required?: string[];
    };

    if (properties) {
      completeTool.parameters.properties = properties;
    }
    if (required) {
      (completeTool.parameters.required as string[]).push(...required);
    }
  }

  toolsList.push(
    new DeclarativeToAdkAdapter(new CompleteTaskTool(completeTool, messageBus)),
  );

  return toolsList;
}

class CompleteTaskTool extends BaseDeclarativeTool<object, ToolResult> {
  constructor(schema: FunctionDeclaration, messageBus: MessageBus) {
    super(
      TASK_COMPLETE_TOOL_NAME,
      'Complete Task',
      schema.description || 'Complete the task',
      Kind.Other,
      schema.parameters,
      false,
      false,
      messageBus,
    );
  }

  override validateToolParams(_params: object): string | null {
    return null;
  }

  protected createInvocation(
    params: object,
  ): ToolInvocation<object, ToolResult> {
    return new CompleteTaskInvocation(params);
  }
}

class CompleteTaskInvocation extends BaseToolInvocation<object, ToolResult> {
  getDescription(): string {
    return 'Completing the task';
  }

  async execute(): Promise<ToolResult> {
    return {
      llmContent: JSON.stringify(this.params),
      returnDisplay: JSON.stringify(this.params, null, 2),
    };
  }
}
