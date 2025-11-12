/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { initCommand } from './initCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { SubmitPromptActionReturn, CommandContext } from './types.js';

describe('initCommand', () => {
  let mockContext: CommandContext;
  let targetDir: string;
  let geminiMdPath: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'initCommand-test-'));
    geminiMdPath = path.join(targetDir, 'GEMINI.md');

    // Create a fresh mock context for each test
    mockContext = createMockCommandContext({
      services: {
        config: {
          getTargetDir: () => targetDir,
        },
      },
    });
  });

  afterEach(() => {
    // Clear all mocks and remove the temporary directory after each test
    vi.clearAllMocks();
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it('should inform the user if GEMINI.md already exists', async () => {
    // Arrange: Create the file to simulate that it exists
    fs.writeFileSync(geminiMdPath, 'existing content');

    // Act: Run the command's action
    const result = await initCommand.action!(mockContext, '');

    // Assert: Check for the correct informational message
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content:
        'A GEMINI.md file already exists in this directory. No changes were made.',
    });
  });

  it('should create GEMINI.md and submit a prompt if it does not exist', async () => {
    // Act: Run the command's action
    const result = (await initCommand.action!(
      mockContext,
      '',
    )) as SubmitPromptActionReturn;

    // Assert: Check that the file was created
    const fileExists = fs.existsSync(geminiMdPath);
    expect(fileExists).toBe(true);

    // Assert: Check that an informational message was added to the UI
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'info',
        text: 'Empty GEMINI.md created. Now analyzing the project to populate it.',
      },
      expect.any(Number),
    );

    // Assert: Check that the correct prompt is submitted
    expect(result.type).toBe('submit_prompt');
    expect(result.content).toContain(
      'You are an AI agent that brings the power of Gemini',
    );
  });

  it('should return an error if config is not available', async () => {
    // Arrange: Create a context without config
    const noConfigContext = createMockCommandContext();
    if (noConfigContext.services) {
      noConfigContext.services.config = null;
    }

    // Act: Run the command's action
    const result = await initCommand.action!(noConfigContext, '');

    // Assert: Check for the correct error message
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration not available.',
    });
  });
});
