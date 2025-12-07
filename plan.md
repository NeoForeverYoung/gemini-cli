---
description:
  Create implementation plan for highest priority Linear ticket ready for spec
---

## PART I - IF A TICKET IS MENTIONED

1.  **Locate Ticket**: Find the ticket file in `~/.gemini/tickets/` (e.g.,
    `linear_ticket_[id].md`).
2.  **Read Context**: Read the ticket file, including Description, Comments, and
    linked Research documents.

## PART I - IF NO TICKET IS MENTIONED

1.  **Read Guidelines**: read `linear.md`
2.  **Fetch Candidates**: fetch the top 10 priority items from
    `~/.gemini/tickets/` in status "Ready for Plan", noting all items.
3.  **Select**: select the highest priority issue from the list (if no issues
    exist, EXIT IMMEDIATELY and inform the user).
4.  **Fetch Details**: read the selected ticket content from
    `~/.gemini/tickets/linear_ticket_[ID].md`.
5.  **Read Context**: read the ticket and all comments to learn about past
    implementations and research, and any questions or concerns about them.

## PART II - NEXT STEPS

think deeply

1. **UPDATE STATUS**: move the item to "Plan in Progress" by updating the ticket
   file's frontmatter 1a. **READ GUIDELINES**: read `create_plan.md` (or
   equivalent plan creation guidelines) 1b. **CHECK EXISTING**: determine if the
   item has a linked implementation plan document based on the `links`
   frontmatter section 1d. if the plan exists, you're done, respond with a link
   to the ticket 1e. **CHECK RESEARCH**: if the research is insufficient or has
   unanswered questions, **STOP** and change status back to "Research Needed".
   1f. **CREATE PLAN**: if research is sufficient, **create a new plan
   document** in `thoughts/shared/plans/` following the instructions in the
   planning guidelines. **DO NOT** write code yet.

think deeply

2. **LINK & FINALIZE**: when the plan is complete, attach the doc to the ticket
   by updating the `links` frontmatter and create a terse comment with a link to
   it (re-read `linear.md` if needed for format) 2a. **UPDATE STATUS**: move the
   item to "Plan in Review" by updating the ticket file's frontmatter

3. **VERIFY DELIVERABLE**:
   - **Action**: Use `ls` or `read_file` to confirm the plan file actually
     exists on disk.
   - **Constraint**: If it is missing, you **MUST** create it now before
     finishing.

think deeply, use `WriteTodosTool` to track your tasks. When fetching tickets,
get the top 10 items by priority but only work on ONE item - specifically the
highest priority issue.

## PART III - When you're done

Print a message for the user (replace placeholders with actual values):

```
✅ Completed implementation plan for Ticket [ID]: [Title]

Approach: [selected approach description]

The plan has been:
- Created at: thoughts/shared/plans/YYYY-MM-DD-ticket-[ID]-[description].md
- Synced to thoughts repository
- Attached to the Ticket (Local)
- Ticket moved to "Plan in Review" status

Implementation phases:
- Phase 1: [phase 1 description]
- Phase 2: [phase 2 description]
- Phase 3: [phase 3 description if applicable]

View the ticket:: ~/.gemini/tickets/linear_ticket_[ID].md
```
