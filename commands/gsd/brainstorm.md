---
name: gsd:brainstorm
description: Converge a rough idea into an approved PRD before a milestone or phase — requirement-level clarification
argument-hint: <rough idea or topic>
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Requirement-level clarification (D3): turn a rough idea into a crisp, reviewable PRD
so downstream planning starts from a clear spec. This is the **convergent** idea→PRD
step — it is native to gsd-remix (self-contained, no external skill). Divergent
ideation is out of scope; bring the idea, leave with a PRD.

Routes to the brainstorm workflow, which:
- Converges the idea through targeted questions (problem, users, scope, success, constraints)
- Drafts a PRD and self-reviews it through Red Team / risk / YAGNI lenses
- Renders a **capability-gated visual companion** (UI mockups + architecture/flow diagrams)
  to confirm the converged idea — degrades to Mermaid-in-PRD on text-only runtimes
- HARD-GATES at the PRD: writes `prds/YYYY-MM-DD-<topic>/PRD.md` and stops for your approval
- The approved PRD is then consumed by `/gsd-new-milestone` / `/gsd-new-project` / `/gsd-plan-phase --prd`
</objective>

<execution_context>
@~/.claude/get-shit-done/references/brainstorm-visuals.md
</execution_context>

Run the brainstorm workflow at `get-shit-done/workflows/brainstorm.md` with `$ARGUMENTS`.
