/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoryTool,
  setGeminiMdFilename,
  getCurrentGeminiMdFilename,
  getAllGeminiMdFilenames,
  DEFAULT_CONTEXT_FILENAME,
} from './memoryTool.js';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { GEMINI_DIR } from '../utils/paths.js';

// Mock os.homedir
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

const MEMORY_SECTION_HEADER = '## Gemini Added Memories';

describe('MemoryTool', () => {
  const mockAbortSignal = new AbortController().signal;
  let tempHomeDir: string;
  let geminiDirPath: string;

  beforeEach(() => {
    vi.resetAllMocks();
    tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-memory-test-'));
    // Canonicalize path to handle potential symlinks (especially on macOS)
    tempHomeDir = fs.realpathSync(tempHomeDir);
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);

    geminiDirPath = path.join(tempHomeDir, GEMINI_DIR);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempHomeDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    // Reset GEMINI_MD_FILENAME to its original value after each test
    setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
  });

  describe('setGeminiMdFilename', () => {
    it('should update currentGeminiMdFilename when a valid new name is provided', () => {
      const newName = 'CUSTOM_CONTEXT.md';
      setGeminiMdFilename(newName);
      expect(getCurrentGeminiMdFilename()).toBe(newName);
    });

    it('should not update currentGeminiMdFilename if the new name is empty or whitespace', () => {
      const initialName = getCurrentGeminiMdFilename(); // Get current before trying to change
      setGeminiMdFilename('  ');
      expect(getCurrentGeminiMdFilename()).toBe(initialName);

      setGeminiMdFilename('');
      expect(getCurrentGeminiMdFilename()).toBe(initialName);
    });

    it('should handle an array of filenames', () => {
      const newNames = ['CUSTOM_CONTEXT.md', 'ANOTHER_CONTEXT.md'];
      setGeminiMdFilename(newNames);
      expect(getCurrentGeminiMdFilename()).toBe('CUSTOM_CONTEXT.md');
      expect(getAllGeminiMdFilenames()).toEqual(newNames);
    });
  });

  describe('performAddMemoryEntry (static method)', () => {
    let testFilePath: string;

    beforeEach(() => {
      testFilePath = path.join(geminiDirPath, DEFAULT_CONTEXT_FILENAME);
    });

    it('should create section and save a fact if file does not exist', async () => {
      const fact = 'The sky is blue';
      // Ensure file does not exist
      expect(fs.existsSync(testFilePath)).toBe(false);

      await MemoryTool.performAddMemoryEntry(fact, testFilePath, fsPromises);

      expect(fs.existsSync(testFilePath)).toBe(true);
      const content = fs.readFileSync(testFilePath, 'utf-8');
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(content).toBe(expectedContent);
    });

    it('should create section and save a fact if file is empty', async () => {
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, ''); // Empty file

      const fact = 'The sky is blue';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, fsPromises);

      const content = fs.readFileSync(testFilePath, 'utf-8');
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(content).toBe(expectedContent);
    });

    it('should add a fact to an existing section', async () => {
      const initialContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- Existing fact 1\n`;
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, initialContent);

      const fact = 'New fact 2';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, fsPromises);

      const content = fs.readFileSync(testFilePath, 'utf-8');
      const expectedContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- Existing fact 1\n- ${fact}\n`;
      expect(content).toBe(expectedContent);
    });

    it('should add a fact to an existing empty section', async () => {
      const initialContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n`; // Empty section
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, initialContent);

      const fact = 'First fact in section';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, fsPromises);

      const content = fs.readFileSync(testFilePath, 'utf-8');
      const expectedContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(content).toBe(expectedContent);
    });

    it('should add a fact when other ## sections exist and preserve spacing', async () => {
      const initialContent = `${MEMORY_SECTION_HEADER}\n- Fact 1\n\n## Another Section\nSome other text.`;
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, initialContent);

      const fact = 'Fact 2';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, fsPromises);

      const content = fs.readFileSync(testFilePath, 'utf-8');
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- Fact 1\n- ${fact}\n\n## Another Section\nSome other text.\n`;
      expect(content).toBe(expectedContent);
    });

    it('should correctly trim and add a fact that starts with a dash', async () => {
      fs.mkdirSync(path.dirname(testFilePath), { recursive: true });
      fs.writeFileSync(testFilePath, `${MEMORY_SECTION_HEADER}\n`);

      const fact = '- - My fact with dashes';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, fsPromises);

      const content = fs.readFileSync(testFilePath, 'utf-8');
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- My fact with dashes\n`;
      expect(content).toBe(expectedContent);
    });

    it('should handle error from fsAdapter.writeFile', async () => {
      // We can use a mock adapter here to simulate FS errors without needing to break the real FS
      const mockAdapter = {
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn().mockRejectedValue(new Error('Disk full')),
        mkdir: vi.fn().mockResolvedValue(undefined),
      };

      const fact = 'This will fail';
      await expect(
        MemoryTool.performAddMemoryEntry(fact, testFilePath, mockAdapter),
      ).rejects.toThrow('[MemoryTool] Failed to add memory entry: Disk full');
    });
  });

  describe('execute (instance method)', () => {
    let memoryTool: MemoryTool;

    beforeEach(() => {
      memoryTool = new MemoryTool();
    });

    it('should have correct name, displayName, description, and schema', () => {
      expect(memoryTool.name).toBe('save_memory');
      expect(memoryTool.displayName).toBe('SaveMemory');
      expect(memoryTool.description).toContain(
        'Saves a specific piece of information',
      );
      expect(memoryTool.schema).toBeDefined();
      expect(memoryTool.schema.name).toBe('save_memory');
      expect(memoryTool.schema.parametersJsonSchema).toStrictEqual({
        type: 'object',
        properties: {
          fact: {
            type: 'string',
            description:
              'The specific fact or piece of information to remember. Should be a clear, self-contained statement.',
          },
        },
        required: ['fact'],
      });
    });

    it('should call performAddMemoryEntry with correct parameters and return success', async () => {
      const params = { fact: 'The sky is blue' };
      const invocation = memoryTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      const expectedFilePath = path.join(
        geminiDirPath,
        getCurrentGeminiMdFilename(),
      );

      const successMessage = `Okay, I've remembered that: "${params.fact}"`;
      expect(result.llmContent).toBe(
        JSON.stringify({ success: true, message: successMessage }),
      );
      expect(result.returnDisplay).toBe(successMessage);

      // Verify file creation on real FS
      expect(fs.existsSync(expectedFilePath)).toBe(true);
      const content = fs.readFileSync(expectedFilePath, 'utf-8');
      expect(content).toContain(params.fact);
    });

    it('should return an error if fact is empty', async () => {
      const params = { fact: ' ' }; // Empty fact
      expect(memoryTool.validateToolParams(params)).toBe(
        'Parameter "fact" must be a non-empty string.',
      );
      expect(() => memoryTool.build(params)).toThrow(
        'Parameter "fact" must be a non-empty string.',
      );
    });

    it('should handle errors from performAddMemoryEntry', async () => {
      const params = { fact: 'This will fail' };
      const underlyingError = new Error(
        '[MemoryTool] Failed to add memory entry: Disk full',
      );

      // Spy on the static method to force failure
      vi.spyOn(MemoryTool, 'performAddMemoryEntry').mockRejectedValue(
        underlyingError,
      );

      const invocation = memoryTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      expect(result.llmContent).toBe(
        JSON.stringify({
          success: false,
          error: `Failed to save memory. Detail: ${underlyingError.message}`,
        }),
      );
      expect(result.returnDisplay).toBe(
        `Error saving memory: ${underlyingError.message}`,
      );
      expect(result.error?.type).toBe(
        ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
      );
    });
  });

  describe('shouldConfirmExecute', () => {
    let memoryTool: MemoryTool;

    beforeEach(() => {
      memoryTool = new MemoryTool();
      // Clear the allowlist before each test
      const invocation = memoryTool.build({ fact: 'mock-fact' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (invocation.constructor as any).allowlist.clear();
    });

    it('should return confirmation details when memory file is not allowlisted', async () => {
      const params = { fact: 'Test fact' };
      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        const expectedPath = path.join(tempHomeDir, GEMINI_DIR, 'GEMINI.md');
        // Note: tildeifyPath in the actual code might not pick up the os.homedir mock
        // depending on how modules are loaded, so we verify the full path which is also correct.
        // If it does tildeify, we can accept that too.
        const title = result.title;
        const expectedTitleFull = `Confirm Memory Save: ${expectedPath}`;
        const expectedTitleTilde = `Confirm Memory Save: ${path.join('~', GEMINI_DIR, 'GEMINI.md')}`;

        expect([expectedTitleFull, expectedTitleTilde]).toContain(title);

        expect(result.fileName).toContain(
          path.join(path.basename(tempHomeDir), GEMINI_DIR),
        );
        expect(result.fileName).toContain('GEMINI.md');
        expect(result.fileDiff).toContain('Index: GEMINI.md');
        expect(result.fileDiff).toContain('+## Gemini Added Memories');
        expect(result.fileDiff).toContain('+- Test fact');
        expect(result.originalContent).toBe('');
        expect(result.newContent).toContain('## Gemini Added Memories');
        expect(result.newContent).toContain('- Test fact');
      }
    });

    it('should return false when memory file is already allowlisted', async () => {
      const params = { fact: 'Test fact' };
      const memoryFilePath = path.join(
        geminiDirPath,
        getCurrentGeminiMdFilename(),
      );

      const invocation = memoryTool.build(params);
      // Add the memory file to the allowlist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (invocation.constructor as any).allowlist.add(memoryFilePath);

      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBe(false);
    });

    it('should add memory file to allowlist when ProceedAlways is confirmed', async () => {
      const params = { fact: 'Test fact' };
      const memoryFilePath = path.join(
        geminiDirPath,
        getCurrentGeminiMdFilename(),
      );

      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        // Simulate the onConfirm callback
        await result.onConfirm(ToolConfirmationOutcome.ProceedAlways);

        // Check that the memory file was added to the allowlist
        expect(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (invocation.constructor as any).allowlist.has(memoryFilePath),
        ).toBe(true);
      }
    });

    it('should not add memory file to allowlist when other outcomes are confirmed', async () => {
      const params = { fact: 'Test fact' };
      const memoryFilePath = path.join(
        geminiDirPath,
        getCurrentGeminiMdFilename(),
      );

      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        // Simulate the onConfirm callback with different outcomes
        await result.onConfirm(ToolConfirmationOutcome.ProceedOnce);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allowlist = (invocation.constructor as any).allowlist;
        expect(allowlist.has(memoryFilePath)).toBe(false);

        await result.onConfirm(ToolConfirmationOutcome.Cancel);
        expect(allowlist.has(memoryFilePath)).toBe(false);
      }
    });

    it('should handle existing memory file with content', async () => {
      const params = { fact: 'New fact' };
      const existingContent =
        'Some existing content.\n\n## Gemini Added Memories\n- Old fact\n';

      // Create the file on the real filesystem
      const memoryFilePath = path.join(
        geminiDirPath,
        getCurrentGeminiMdFilename(),
      );
      fs.mkdirSync(path.dirname(memoryFilePath), { recursive: true });
      fs.writeFileSync(memoryFilePath, existingContent);

      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        const expectedPath = path.join(tempHomeDir, GEMINI_DIR, 'GEMINI.md');
        const title = result.title;
        const expectedTitleFull = `Confirm Memory Save: ${expectedPath}`;
        const expectedTitleTilde = `Confirm Memory Save: ${path.join('~', GEMINI_DIR, 'GEMINI.md')}`;

        expect([expectedTitleFull, expectedTitleTilde]).toContain(title);

        expect(result.fileDiff).toContain('Index: GEMINI.md');
        expect(result.fileDiff).toContain('+- New fact');
        expect(result.originalContent).toBe(existingContent);
        expect(result.newContent).toContain('- Old fact');
        expect(result.newContent).toContain('- New fact');
      }
    });
  });
});
