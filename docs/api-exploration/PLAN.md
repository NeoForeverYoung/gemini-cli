# Plan: Gemini CLI UI/Core Boundary Analysis (Extended)

This document outlines the plan for a deep-dive analysis of the boundary between the Gemini CLI UI (`packages/cli`) and the Gemini CLI Core (`packages/core`). This is an extension of the initial investigation.

## 1. Initial Research & Context Gathering (Completed)

*   **Objective:** Understand the high-level architecture and key components.
*   **Tasks:**
    *   Thoroughly read all documentation in the `docs/` directory.
    *   Analyze the provided PDF, "Gemini CLI - Deep Dive.pdf".

## 2. Code Exploration: Identifying the Seam (Completed)

*   **Objective:** Pinpoint the exact files and modules that constitute the API/boundary.
*   **Tasks:**
    *   Analyze `useGeminiStream.ts` and `GeminiClient`.
    *   Trace the high-level data flow.

## 3. Deep Dive: The "API" Specification (Completed)

*   **Objective:** Document the specific API contract in detail.
*   **Tasks:**
    *   Document the request/response flow.
    *   Document the Tool Confirmation Flow.

## 4. Extended Deep Dive: Implementation Details & Nuances (Completed)

*   **Objective:** Go beyond the primary boundary files to understand the implementation details that support the API contract.
*   **Tasks:**
    *   Analyze `CoreToolScheduler`, `GeminiChat`, `nonInteractiveCli.ts`, and `AppContainer.tsx`.

## 5. Synthesizing the Extended Report (Completed)

*   **Objective:** Update the report with a more detailed and nuanced explanation of the boundary.
*   **Tasks:**
    *   Incorporate findings into `docs/gemini-cli-api.md`.

## 6. Formatting Report (Completed)

*   **Objective:** Format `docs/gemini-cli-api.md` to 78 characters per line using `mdformat`.
*   **Tasks:**
    *   Execute `mdformat --wrap 78 /Users/dewitt/git/gemini-cli/docs/gemini-cli-api.md`.

## 7. Review and Finalize

*   **Objective:** Ensure the updated report is accurate, clear, and complete.
*   **Tasks:**
    *   Review the updated `docs/gemini-cli-api.md` against all analyzed source code.
    *   Mark the project as complete in `STATUS.md`.