---
description:
  Manage Linear tickets via local markdown files in ~/.gemini/tickets/ and Todo
  tools
---

# Linear - Ticket Management (Local Mode)

You are tasked with managing "Linear tickets" locally using markdown files
stored in the user's global configuration directory and the `WriteTodosTool`.
This replaces the cloud-based Linear MCP workflow.

## Core Concepts

1.  **Tickets as Files**: Tickets are stored as markdown files in the **global
    user directory**: `~/.gemini/tickets/` (ensure this directory exists).
    - **Naming Convention**: `~/.gemini/tickets/linear_ticket_[hash].md` (where
      `[hash]` is a generated 8-character hex string).
    - **Format**: Frontmatter for metadata, Markdown body for content.

2.  **Session Planning**: Use `WriteTodosTool` to track immediate subtasks when
    working on a specific ticket in the current session.

## Initial Setup & Interaction

First, verify that the ticket directory `~/.gemini/tickets/` exists.

### For general requests:

```
I can help you with Linear tickets (Local Mode). What would you like to do?
1. Create a new ticket from a thoughts document
2. Add a comment to a ticket (I'll use our conversation context)
3. Search for tickets
4. Update ticket status or details
```

### For specific create requests:

```
I'll help you create a local Linear ticket from your thoughts document. Please provide:
1. The path to the thoughts document (or topic to search for)
2. Any specific focus or angle for the ticket (optional)
```

Then wait for the user's input.

## Team Workflow & Status Progression

The team follows a specific workflow to ensure alignment before code
implementation:

1. **Triage** → All new tickets start here for initial review
2. **Spec Needed** → More detail is needed - problem to solve and solution
   outline necessary
3. **Research Needed** → Ticket requires investigation before plan can be
   written
4. **Research in Progress** → Active research/investigation underway
5. **Research in Review** → Research findings under review (optional step)
6. **Ready for Plan** → Research complete, ticket needs an implementation plan
7. **Plan in Progress** → Actively writing the implementation plan
8. **Plan in Review** → Plan is written and under discussion
9. **Ready for Dev** → Plan approved, ready for implementation
10. **In Dev** → Active development
11. **Code Review** → PR submitted
12. **Done** → Completed

**Key principle**: Review and alignment happen at the plan stage (not PR stage)
to move faster and avoid rework.

## Important Conventions

### Path Mapping for Thoughts Documents

When referencing thoughts documents, always provide the relative local path in
the `links` frontmatter section:

- Use relative paths from the workspace root: `thoughts/shared/...`,
  `thoughts/allison/...`, `thoughts/global/...`.
- Do NOT convert these to GitHub URLs. Keep them as local file paths.

### Default Values

- **Status**: Always create new tickets in "Triage" status.
- **Project**: Default to "project" in the frontmatter unless told otherwise.
- **Priority**: Default to Medium (3) for most tasks, use best judgment or ask
  user.
  - Urgent (1): Critical blockers, security issues
  - High (2): Important features with deadlines, major bugs
  - Medium (3): Standard implementation tasks (default)
  - Low (4): Nice-to-haves, minor improvements
- **Links**: Use the `links` frontmatter list to attach URLs.

### Automatic Label Assignment

Automatically apply labels based on the ticket content:

- **hld**: For tickets about the `hld/` directory (the daemon)
- **wui**: For tickets about `humanlayer-wui/`
- **meta**: For tickets about `hlyr` commands, thoughts tool, or `thoughts/`
  directory

Note: meta is mutually exclusive with hld/wui. Tickets can have both hld and
wui, but not meta with either.

## Ticket Structure

Each ticket file must follow this structure:

```markdown
---
id: [8-char-hex-hash]
title: [Ticket Title]
status: [Status]
priority: [Urgent|High|Medium|Low]
project: project
created: [YYYY-MM-DD]
links:
  - url: [URL]
    title: [Title]
labels: [hld, wui, meta, etc.]
---

# Description

[Problem statement and solution outline]

# Discussion/Comments

- [YYYY-MM-DD] User: Comment text...
```

## Action-Specific Instructions

### 1. Creating Tickets from Thoughts

#### Steps to follow after receiving the request:

1. **Locate and read the thoughts document:**
   - If given a path, read the document directly
   - If given a topic/keyword, search thoughts/ directory using Grep to find
     relevant documents
   - If multiple matches found, show list and ask user to select
   - Create a `WriteTodosTool` list to track: Read document → Analyze content →
     Draft ticket → Get user input → Create ticket

2. **Analyze the document content:**
   - Identify the core problem or feature being discussed
   - Extract key implementation details or technical decisions
   - Note any specific code files or areas mentioned
   - Look for action items or next steps
   - Identify what stage the idea is at (early ideation vs ready to implement)
   - Take time to ultrathink about distilling the essence of this document into
     a clear problem statement and solution approach

3. **Check for related context (if mentioned in doc):**
   - If the document references specific code files, read relevant sections
   - If it mentions other thoughts documents, quickly check them
   - Look for any existing Linear tickets mentioned (search in
     `~/.gemini/tickets/`)

4. **Draft the ticket summary:** Present a draft to the user:

   ```
   ## Draft Linear Ticket

   **Title**: [Clear, action-oriented title]

   **Description**:
   [2-3 sentence summary of the problem/goal]

   ## Key Details
   - [Bullet points of important details from thoughts]
   - [Technical decisions or constraints]
   - [Any specific requirements]

   ## Implementation Notes (if applicable)
   [Any specific technical approach or steps outlined]

   ## References
   - Source: `thoughts/[path/to/document.md]` ([Local File])
   - Related code: [any file:line references]
   - Parent ticket: [if applicable]

   ---
   Based on the document, this seems to be at the stage of: [ideation/planning/ready to implement]
   ```

5. **Interactive refinement:** Ask the user:
   - Does this summary capture the ticket accurately?
   - What priority? (Default: Medium)
   - Any additional context to add?
   - Should we include more/less implementation detail?

   Note: Ticket will be created in "Triage" status by default.

6. **Create the Linear ticket:**
   - Generate ID: `openssl rand -hex 4` (or internal random string).
   - Write file to `~/.gemini/tickets/linear_ticket_[ID].md` with Frontmatter
     and Markdown content.

   **Frontmatter Example:**

   ```yaml
   ---
   id: a1b2c3d4
   title: [refined title]
   status: Triage
   priority: [selected priority]
   project: project
   created: [YYYY-MM-DD]
   links:
     - url: [Local path to thoughts doc]
       title: [Document Title]
   labels: [derived labels]
   ---
   ```

7. **Post-creation actions:**
   - Show the created ticket path and ID.
   - Ask if user wants to:
     - Add a comment with additional implementation details
     - Create sub-tasks for specific action items
     - Update the original thoughts document with the ticket reference
   - If yes to updating thoughts doc:
     ```
     Add at the top of the document:
     ---
     linear_ticket: [Ticket ID]
     created: [date]
     ---
     ```

## Example transformations:

### From verbose thoughts:

```
"I've been thinking about how our resumed sessions don't inherit permissions properly.
This is causing issues where users have to re-specify everything. We should probably
store all the config in the database and then pull it when resuming. Maybe we need
new columns for permission_prompt_tool and allowed_tools..."
```

### To concise ticket:

```
Title: Fix resumed sessions to inherit all configuration from parent

Description:

## Problem to solve
Currently, resumed sessions only inherit Model and WorkingDir from parent sessions,
causing all other configuration to be lost. Users must re-specify permissions and
settings when resuming.

## Solution
Store all session configuration in the database and automatically inherit it when
resuming sessions, with support for explicit overrides.
```

### 2. Adding Comments and Links to Existing Tickets

When user wants to add a comment to a ticket:

1. **Determine which ticket:**
   - Use context from the current conversation to identify the relevant ticket.
   - If uncertain, search `~/.gemini/tickets/` to find and confirm with the
     user.

2. **Format comments for clarity:**
   - Attempt to keep comments concise (~10 lines) unless more detail is needed.
   - Focus on the key insight or most useful information.
   - Include relevant file references with backticks and GitHub links.

3. **File reference formatting:**
   - Wrap paths in backticks: `thoughts/allison/example.md`
   - Add GitHub link after: `([View](url))`
   - Do this for both thoughts/ and code files mentioned

4. **Comment structure example:**

   ```markdown
   Implemented retry logic in webhook handler to address rate limit issues.

   Key insight: The 429 responses were clustered during batch operations, so
   exponential backoff alone wasn't sufficient - added request queuing.

   Files updated:

   - `hld/webhooks/handler.go` ([GitHub](link))
   - `thoughts/shared/rate_limit_analysis.md` ([GitHub](link))
   ```

5. **Handle links properly:**
   - If adding a link, **update the frontmatter** `links` list AND mention it in
     the comment.
   - Use `read_file` to get the current content, modify it, and then
     `write_file`.

6. **For comments with links (Action):**
   - Read ticket file: `~/.gemini/tickets/linear_ticket_[ID].md`.
   - Update frontmatter: Add new link to `links` list.
   - Append to `# Discussion/Comments` section:
     ```markdown
     - [YYYY-MM-DD] User: [formatted comment]
     ```

7. **For links only (Action):**
   - Read ticket file.
   - Update frontmatter: Add new link.
   - Append brief comment:
     ```markdown
     - [YYYY-MM-DD] User: Added link: `path/to/doc.md` ([View](url))
     ```

### 3. Searching for Tickets

When user wants to find tickets:

1. **Gather search criteria:**
   - Query text
   - Status filters
   - Priority
   - Date ranges (createdAt, updatedAt)

2. **Execute search:**
   - **List all**: `glob` pattern `~/.gemini/tickets/linear_ticket_*.md`.
   - **Filter**: Iterate through files, `read_file` (with limit/offset to read
     frontmatter), and filter based on criteria.
   - **Content Search**: Use `search_file_content` targeting the
     `~/.gemini/tickets/` directory if searching for text in description.

3. **Present results:**
   - Show ID, Title, Status, Priority.
   - Group by project/status if helpful.

### 4. Updating Ticket Status

When moving tickets through the workflow:

1. **Get current status:**
   - Read the ticket file to see current `status` in frontmatter.

2. **Suggest next status:**
   - Triage → Spec Needed
   - Spec Needed → Research Needed
   - Research Needed → Research in Progress
   - Research in Progress → Research in Review
   - Research in Review → Ready for Plan
   - Ready for Plan → Plan in Progress
   - Plan in Progress → Plan in Review
   - Plan in Review → Ready for Dev
   - Ready for Dev → In Dev
   - In Dev → Code Review
   - Code Review → Done

3. **Update with context:**
   - Read file `~/.gemini/tickets/linear_ticket_[ID].md`.
   - Update `status: [New Status]` in frontmatter.
   - Optionally append a comment explaining the change.
   - Write file back.

## Important Notes

- Tag users in descriptions and comments using `@[name]` format.
- Keep tickets concise but complete - aim for scannable content.
- All tickets should include a clear "problem to solve".
- Focus on the "what" and "why", include "how" only if well-defined.
- Always preserve links to source material using the `links` frontmatter.
- Don't create tickets from early-stage brainstorming unless requested.
- Use proper Markdown formatting.
- Include code references as: `path/to/file.ext:linenum`.
- Remember - you must get a "Problem to solve"!

## Comment Quality Guidelines

When creating comments, focus on extracting the **most valuable information**:

- **Key insights over summaries**: What's the "aha" moment or critical
  understanding?
- **Decisions and tradeoffs**: What approach was chosen and what it
  enables/prevents
- **Blockers resolved**: What was preventing progress and how it was addressed
- **State changes**: What's different now and what it means for next steps
- **Surprises or discoveries**: Unexpected findings that affect the work

**Avoid:**

- Mechanical lists of changes without context
- Restating what's obvious from code diffs
- Generic summaries that don't add value

Remember: The goal is to help a future reader (including yourself) quickly
understand what matters about this update.
