---
name: gsd:escalate
description: Escalate a completed quick task into a heavy phase, carrying its work forward as evidence
argument-hint: <quick-task-id> [--why "reason"]
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Escalate work that outgrew its lane into the heavy flow **without losing context,
decisions, or already-committed code**. v1 handles quick → heavy only.

Routes to the escalate workflow, which:
- Chooses an `evidence_status` for the prior quick-task work (accepted / suspect / revert-recommended)
- Seeds a new heavy phase from the quick task's CONTEXT, plan, and commits (via `route.escalate`)
- Updates STATE so `/gsd-next` routes the seeded phase to planning (never verify)
- Never reverts committed code (use `/gsd-undo` for that)
</objective>

Run the escalate workflow at `get-shit-done/workflows/escalate.md` with `$ARGUMENTS`.
