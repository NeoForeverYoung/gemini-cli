/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type FunctionTool,
  BaseTool as AdkBaseTool,
  type RunAsyncToolRequest,
  type ToolContext,
} from '@google/adk';
import {
  type AnyDeclarativeTool,
  BaseToolInvocation,
  DeclarativeTool,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { FunctionDeclaration, Schema } from '@google/genai';
import type { ZodObject } from 'zod';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ShellExecutionConfig } from '../services/shellExecutionService.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';

/**
 * Input parameters of the function tool.
 * Copied from @google/adk/core/src/tools/function_tool.ts to avoid any usage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolInputParameters = undefined | ZodObject<any> | Schema;

/**
 * An adapter that wraps a gemini-cli DeclarativeTool to make it compatible
 * with the adk LlmAgent.
 */
export class DeclarativeToAdkAdapter extends AdkBaseTool {
  constructor(readonly tool: AnyDeclarativeTool) {
    super(tool);
  }

  override _getDeclaration(): FunctionDeclaration | undefined {
    return this.tool.schema;
  }

  async runAsync(request: RunAsyncToolRequest): Promise<unknown> {
    const invocation = this.tool.build(request.args);
    const abortController = new AbortController();
    const result = await invocation.execute(abortController.signal);
    return result;
  }
}

/**
 * An adapter that wraps an ADK FunctionTool to make it compatible
 * with the gemini-cli DeclarativeTool and MessageBus.
 */
export class AdkToDeclarativeAdapter extends DeclarativeTool<
  object,
  ToolResult
> {
  constructor(
    readonly tool: FunctionTool<ToolInputParameters>,
    private readonly toolContext: ToolContext,
    messageBus?: MessageBus,
  ) {
    const declaration = tool._getDeclaration();
    super(
      tool.name,
      tool.name, // displayName
      tool.description,
      Kind.Execute, // Defaulting to Execute for FunctionTools
      declaration.parameters,
      true, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
  }

  build(params: object): ToolInvocation<object, ToolResult> {
    return new AdkToDeclarativeInvocation(
      params,
      this.tool,
      this.toolContext,
      this.messageBus,
      this.name,
      this.displayName,
    );
  }
}

class AdkToDeclarativeInvocation extends BaseToolInvocation<
  object,
  ToolResult
> {
  constructor(
    params: object,
    private readonly tool: FunctionTool<ToolInputParameters>,
    private readonly toolContext: ToolContext,
    messageBus?: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Execute function ${this.tool.name}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string | AnsiOutput) => void,
    _shellExecutionConfig?: ShellExecutionConfig,
  ): Promise<ToolResult> {
    try {
      // The ADK FunctionTool.runAsync takes RunAsyncToolRequest.
      const result = await this.tool.runAsync({
        args: this.params as Record<string, unknown>,
        toolContext: this.toolContext,
      });

      return {
        llmContent: JSON.stringify(result),
        returnDisplay: JSON.stringify(result, null, 2),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

export function isDeclarativeToAdkAdapter(
  obj: unknown,
): obj is DeclarativeToAdkAdapter {
  return obj instanceof DeclarativeToAdkAdapter;
}
