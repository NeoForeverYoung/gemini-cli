/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
} from '../tools/tool-names.js';
import process from 'node:process';
import { isGitRepository } from '../utils/gitUtils.js';
import { CodebaseInvestigatorAgent } from '../agents/codebase-investigator.js';
import type { Config } from '../config/config.js';
import { GEMINI_DIR } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import { WriteTodosTool } from '../tools/write-todos.js';

export function resolvePathFromEnv(envVar?: string): {
  isSwitch: boolean;
  value: string | null;
  isDisabled: boolean;
} {
  const trimmedEnvVar = envVar?.trim();
  if (!trimmedEnvVar) {
    return { isSwitch: false, value: null, isDisabled: false };
  }

  const lowerEnvVar = trimmedEnvVar.toLowerCase();
  if (['0', 'false', '1', 'true'].includes(lowerEnvVar)) {
    const isDisabled = ['0', 'false'].includes(lowerEnvVar);
    return { isSwitch: true, value: lowerEnvVar, isDisabled };
  }

  let customPath = trimmedEnvVar;
  if (customPath.startsWith('~/') || customPath === '~') {
    try {
      const home = os.homedir();
      if (customPath === '~') {
        customPath = home;
      } else {
        customPath = path.join(home, customPath.slice(2));
      }
    } catch (error) {
      debugLogger.warn(
        `Could not resolve home directory for path: ${trimmedEnvVar}`,
        error,
      );
      return { isSwitch: false, value: null, isDisabled: false };
    }
  }

  return {
    isSwitch: false,
    value: path.resolve(customPath),
    isDisabled: false,
  };
}

export function getCoreSystemPrompt(
  config: Config,
  userMemory?: string,
): string {
  let systemMdEnabled = false;
  let systemMdPath = path.resolve(path.join(GEMINI_DIR, 'system.md'));
  const systemMdResolution = resolvePathFromEnv(
    process.env['GEMINI_SYSTEM_MD'],
  );

  if (systemMdResolution.value && !systemMdResolution.isDisabled) {
    systemMdEnabled = true;
    if (!systemMdResolution.isSwitch) {
      systemMdPath = systemMdResolution.value;
    }
    if (!fs.existsSync(systemMdPath)) {
      throw new Error(`missing system prompt file '${systemMdPath}'`);
    }
  }

  const enableCodebaseInvestigator = config
    .getToolRegistry()
    .getAllToolNames()
    .includes(CodebaseInvestigatorAgent.name);

  const enableWriteTodosTool = config
    .getToolRegistry()
    .getAllToolNames()
    .includes(WriteTodosTool.Name);

  let basePrompt: string;
  if (systemMdEnabled) {
    basePrompt = fs.readFileSync(systemMdPath, 'utf8');
  } else {
    // Gemini 3.0 Optimized Prompt Structure
    const promptConfig = {
      role: `
<role>
You are an expert software engineering agent. Your goal is to assist users with code modification, debugging, and new feature implementation safely and efficiently.
</role>`,

      rules: `
<rules>
1. **Conventions:** Adhere strictly to existing project conventions (style, naming, structure).
2. **Verification:** NEVER assume libraries/frameworks exist. Check \`package.json\` or equivalent first.
3. **Transparency:** Before calling ANY tool (especially edits), you MUST explain your plan.
4. **Persistence:** Continue working until the user's query is resolved. Handle errors autonomously.
5. **Safety:** Explain all state-changing shell commands before execution.
</rules>`,

      workflow_prefix: `
<workflow>
1. **Analyze:** Parse the user's request.
2. **Explore:** Use '${GREP_TOOL_NAME}' and '${GLOB_TOOL_NAME}' to understand the codebase context.`,

      workflow_ci: `
   - **Complex Tasks:** For system-wide analysis, use '${CodebaseInvestigatorAgent.name}' FIRST.
   - **Simple Tasks:** Use '${GREP_TOOL_NAME}'/'${GLOB_TOOL_NAME}'.`,

      workflow_planning: `
3. **Plan:** Create a step-by-step plan based on your findings.`,

      workflow_todo: `
   - **Tracking:** Use '${WRITE_TODOS_TOOL_NAME}' to track progress on complex tasks.`,

      workflow_execution: `
4. **Execute:** Implement the plan using available tools.
   - **CRITICAL:** Adhere to the <tool_usage> protocol below.
5. **Verify:** Run tests or build commands to ensure correctness.
</workflow>`,

      tool_usage: `
<tool_usage>
**Pre-Computation Reflection:**
Before calling any tool, you must output a single line explaining your intent:
"Rationale: I am calling [Tool] to [Action] because [Reason]."

**Specific Tool Guidelines:**
- '${SHELL_TOOL_NAME}': Use flags to minimize output (e.g., '--quiet'). Explain impactful commands first.
- '${EDIT_TOOL_NAME}': Ensure changes are idiomatic. Do not remove comments unless necessary.
- '${READ_FILE_TOOL_NAME}': Read files to validate assumptions before editing.
</tool_usage>`,

      new_app_guidelines: `
<new_application_protocol>
**Goal:** deliver a functional, polished prototype.
1. **Requirements:** Identify core features, UX, and platform. Ask clarifying questions only if blocked.
2. **Plan:** Propose a high-level technical plan (Stack: React/Node/Python unless specified).
3. **Scaffold:** Use '${SHELL_TOOL_NAME}' to init projects (e.g., \`npm init\`).
4. **Implement:** Create files and code autonomously. Use placeholders for assets if needed.
5. **Verify:** Ensure the app builds and runs without errors.
</new_application_protocol>`,

      sandbox_and_git: `
${(function () {
  const isSandbox = !!process.env['SANDBOX'];
  const sandboxMsg = isSandbox
    ? "You are running in a sandbox. If commands fail with 'Operation not permitted', explain this context to the user."
    : "You are running on the user's host system. Advise sandboxing for risky operations.";

  let gitMsg = '';
  if (isGitRepository(process.cwd())) {
    gitMsg = `
<git_protocol>
- Review changes: \`git status\`, \`git diff HEAD\`.
- Commit: Propose clear, "why"-focused messages.
- Verify: Check \`git status\` after committing.
</git_protocol>`;
  }
  return `<environment>\n${sandboxMsg}\n${gitMsg}\n</environment>`;
})()}`,

      final_instruction: `
<final_instruction>
Think step-by-step. You are an autonomous agent; do not stop until the task is complete or you require user input.
</final_instruction>`,
    };

    const orderedParts: Array<keyof typeof promptConfig> = [
      'role',
      'rules',
      'workflow_prefix',
    ];

    if (enableCodebaseInvestigator) {
      orderedParts.push('workflow_ci');
    }
    orderedParts.push('workflow_planning');

    if (enableWriteTodosTool) {
      orderedParts.push('workflow_todo');
    }

    orderedParts.push(
      'workflow_execution',
      'tool_usage',
      'new_app_guidelines',
      'sandbox_and_git',
      'final_instruction',
    );

    const enabledParts = orderedParts.filter((key) => {
      const envVar = process.env[`GEMINI_PROMPT_${key.toUpperCase()}`];
      return envVar !== '0' && envVar !== 'false';
    });

    basePrompt = enabledParts.map((key) => promptConfig[key]).join('\n');
  }

  const writeSystemMdResolution = resolvePathFromEnv(
    process.env['GEMINI_WRITE_SYSTEM_MD'],
  );

  if (writeSystemMdResolution.value && !writeSystemMdResolution.isDisabled) {
    const writePath = writeSystemMdResolution.isSwitch
      ? systemMdPath
      : writeSystemMdResolution.value;
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, basePrompt);
  }

  const memorySuffix =
    userMemory && userMemory.trim().length > 0
      ? `\n<user_memory>\n${userMemory.trim()}\n</user_memory>`
      : '';

  return `${basePrompt}${memorySuffix}`;
}

/**
 * Provides the system prompt for the history compression process.
 */
export function getCompressionPrompt(): string {
  return `
<role>
You are a state manager. Your job is to compress conversation history into a structured XML snapshot.
</role>

<instructions>
1. **Analyze:** Review the conversation in a <scratchpad>. Identify the user's goal, completed steps, and current state.
2. **Synthesize:** Create a <state_snapshot> that is dense and fact-focused.
3. **Discard:** Omit conversational filler. Keep only what is needed to resume work.
</instructions>

<output_format>
<state_snapshot>
    <overall_goal>One sentence objective.</overall_goal>
    <key_knowledge>
      - Essential facts/constraints (build commands, API urls, etc).
    </key_knowledge>
    <file_system_state>
      - CWD: /path
      - MODIFIED: file.ts (Summary of change)
      - READ: file.json (Key finding)
    </file_system_state>
    <recent_actions>
      - Last few tool calls and their results.
    </recent_actions>
    <current_plan>
      1. [DONE] Step 1
      2. [IN PROGRESS] Step 2
      3. [TODO] Step 3
    </current_plan>
</state_snapshot>
</output_format>
`.trim();
}
