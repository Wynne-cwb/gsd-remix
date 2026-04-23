---
name: gsd:health
description: Diagnose planning or runtime health and optionally repair planning issues
argument-hint: [--runtime] [--repair] [--backfill]
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
---
<objective>
Validate `.planning/` directory integrity or the installed GSD runtime and report actionable issues. Planning mode checks for missing files, invalid configurations, inconsistent state, and orphaned plans. Runtime mode checks the installed Node runtime and legacy bridge health.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/health.md
</execution_context>

<process>
Execute the health workflow from @~/.claude/get-shit-done/workflows/health.md end-to-end.
Parse `--runtime`, `--repair`, and `--backfill` flags from arguments and pass them to the workflow.
</process>
