/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import type { Config } from '../config/config.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import {
  getCoreSystemPrompt,
  resolvePathFromEnv,
  PROMPT_CORE_MANDATES,
  PROMPT_TONE_AND_STYLE,
  PROMPT_SECURITY_AND_SAFETY,
  PROMPT_TOOL_USAGE_PREFIX,
  PROMPT_SHELL_EFFICIENCY,
  PROMPT_FINAL_REMINDER,
  PROMPT_TOOL_USAGE_INTERACTIVE,
  PROMPT_TOOL_USAGE_NON_INTERACTIVE,
  PROMPT_TOOL_USAGE_SUFFIX,
} from './prompts.js';
import { getResponseText } from '../utils/partUtils.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  GENERATOR_SYSTEM_PROMPT,
  generateGeneratorUserMessage,
} from './generatorprompt.js';

export class SystemPromptGenerator {
  constructor(private readonly config: Config) {}

  async generate(userRequest: string): Promise<string> {
    debugLogger.log('[SystemPromptGenerator] generate called.');
    // If dynamic generation is disabled, return the static core prompt.
    if (!this.config.getEnableDynamicSystemPrompt()) {
      debugLogger.log(
        '[SystemPromptGenerator] Dynamic prompt disabled in config.',
      );
      return getCoreSystemPrompt(this.config);
    }

    // If a custom system prompt file is specified via environment variable,
    // respect it and skip dynamic generation.
    const systemMdResolution = resolvePathFromEnv(
      process.env['GEMINI_SYSTEM_MD'],
    );
    if (systemMdResolution.value && !systemMdResolution.isDisabled) {
      debugLogger.log(
        '[SystemPromptGenerator] Custom system.md found, skipping dynamic generation.',
      );
      return getCoreSystemPrompt(this.config);
    }

    const toolDefinitions = this.config
      .getToolRegistry()
      .getFunctionDeclarations();

    const shellEfficiency = this.config.getEnableShellOutputEfficiency()
      ? PROMPT_SHELL_EFFICIENCY
      : '';

    const toolUsageInteractive = !this.config.isInteractiveShellEnabled()
      ? PROMPT_TOOL_USAGE_NON_INTERACTIVE
      : PROMPT_TOOL_USAGE_INTERACTIVE;

    // Assemble the Core Mandates and Tool Usage strings to pass to the generator
    const coreMandates = `
${PROMPT_CORE_MANDATES}

${PROMPT_TONE_AND_STYLE}

${PROMPT_SECURITY_AND_SAFETY}

${PROMPT_FINAL_REMINDER}
`.trim();

    const toolUsage = `
${PROMPT_TOOL_USAGE_PREFIX}
${toolUsageInteractive}
${PROMPT_TOOL_USAGE_SUFFIX}

${shellEfficiency}

Available Tools Definitions:
${JSON.stringify(toolDefinitions, null, 2)}
`.trim();

    const userMessage = generateGeneratorUserMessage(
      userRequest,
      coreMandates,
      toolUsage,
    );

    try {
      const generator = this.config.getContentGenerator();
      // Use Flash for speed
      const response = await generator.generateContent(
        {
          model: DEFAULT_GEMINI_FLASH_MODEL,
          config: {
            temperature: 0.7,
            topP: 0.95,
            topK: 64,
            systemInstruction: GENERATOR_SYSTEM_PROMPT,
          },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        },
        'system-prompt-generation',
      );

      const generatedPrompt = getResponseText(response);
      if (!generatedPrompt) {
        debugLogger.warn(
          'SystemPromptGenerator: Empty response from meta-model. Fallback to static prompt.',
        );
        return getCoreSystemPrompt(this.config);
      }

      return generatedPrompt;
    } catch (error) {
      debugLogger.warn(
        'SystemPromptGenerator: Failed to generate dynamic prompt. Fallback to static prompt.',
        error,
      );
      return getCoreSystemPrompt(this.config);
    }
  }
}
