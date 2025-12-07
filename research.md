---
description: Research highest priority Linear ticket needing investigation
---

## PART I - IF A TICKET IS MENTIONED

1.  **Locate Ticket**: Find the ticket file in `~/.gemini/tickets/` (e.g.,
    `linear_ticket_[id].md`).
2.  **Read Context**: Read the ticket file, including the Description and all
    Comments, to understand what research is needed and any previous attempts.

## PART I - IF NO TICKET IS MENTIONED

1.  **Read Guidelines**: Read `linear.md` to understand the local ticket format
    and workflow.
2.  **Find Candidates**:
    - List all files in `~/.gemini/tickets/`.
    - Read frontmatter to filter for `status: Research Needed`.
3.  **Select**:
    - Sort by `priority` (Urgent > High > Medium > Low).
    - Select the highest priority issue.
    - If no items found, EXIT IMMEDIATELY and inform the user.
4.  **Read Context**: Read the selected ticket file to understand requirements.

## PART II - NEXT STEPS

think deeply

1.  **Update Status**:
    - Edit the ticket file's frontmatter: change `status` to
      `Research in Progress`.
    - (Optional) Add a comment noting research has started.

2.  **Analyze Context**:
    - Read any linked documents in the `links` frontmatter section.
    - If insufficient information, add a comment asking for clarification,
      change status back to `Research Needed`, and exit.

think deeply about the research needs

3.  **Conduct Research**:
    - **CRITICAL PROTOCOL**: You are **FORBIDDEN** from writing code or running
      generic searches yet.
    - **MANDATORY FIRST STEP**: The **FIRST** tool call you make in this phase
      **MUST** be `codebase_investigator`.
      - _Why?_: You cannot research without a mental map of the system
        architecture.
    - **FORBIDDEN TOOLS (Initially)**: Do **NOT** use `search_file_content`
      (grep) or `glob` until you have analyzed the investigator report.
    - **Step 2: External (Optional)**: If you need docs/web info, use
      `GoogleWebSearch` (only if the ticket explicitly requires it).
    - **Step 3: Details**: Only **AFTER** the investigator report is in your
      context, use `read_file` or `search_file_content` to examine specific
      files it identified.
    - **Goal**: Document how things work today and potential paths forward. Be
      unbiased.

4.  **Document Findings**:
    - Create a new thoughts document:
      `thoughts/shared/research/YYYY-MM-DD-ticket-[ID]-[description].md`.
      - `YYYY-MM-DD`: Today's date.
      - `[ID]`: The 8-char ticket ID (e.g., `a1b2c3d4`).
      - `[description]`: Brief kebab-case topic (e.g., `parent-child-tracking`).
    - **Constraint**: **DO NOT SKIP THIS STEP.** You cannot proceed to Planning
      without this file.

think deeply about the findings

5.  **Synthesize research into actionable insights**: 5a. summarize key findings
    and technical decisions 5b. identify potential implementation approaches 5c.
    note any risks or concerns discovered

6.  **Update the ticket**: 6a. attach the research document to the ticket by
    updating the `links` frontmatter (convert path to GitHub URL per
    `linear.md`) 6b. add a comment summarizing the research outcomes 6c. move
    the item to "Research in Review" by updating the `status` frontmatter

7.  **Verify Deliverable**:
    - **Action**: Use `read_file` or `ls` to confirm the research file actually
      exists on disk.
    - **Constraint**: If it is missing, you **MUST** create it now before
      finishing.

think deeply, use `WriteTodosTool` to track your tasks. When fetching tickets,
get the top 10 items by priority but only work on ONE item - specifically the
highest priority issue.

## PART III - When you're done

Print a message for the user (replace placeholders with actual values):

```
✅ Completed research for Ticket [ID]: [Title]

Research topic: [research topic description]

The research has been:
- Created at: thoughts/shared/research/YYYY-MM-DD-ticket-[ID]-[description].md
- Synced to thoughts repository
- Attached to the Ticket
- Ticket moved to "Research in Review" status

Key findings:
- [Major finding 1]
- [Major finding 2]
- [Major finding 3]

View the ticket:: ~/.gemini/tickets/linear_ticket_[ID].md
```
