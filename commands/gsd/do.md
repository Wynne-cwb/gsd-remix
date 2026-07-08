---
name: gsd:do
description: Use by default whenever the user describes something to build, change, fix, debug, refactor, implement, or migrate in code — any freeform dev task — even if no /gsd-* command is named. Sizes the task and routes it to the right GSD lane (fast / quick / full flow). Skip only for pure questions or when a specific /gsd-* command is already named.
argument-hint: "<description of what you want to do>"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
<objective>
Analyze freeform natural language input and dispatch to the most appropriate GSD command.

Acts as a smart dispatcher — never does the work itself. Matches intent to the best GSD command using routing rules, confirms the match, then hands off.

Use for any freeform dev request — building, fixing, changing, refactoring, or migrating code — including (but not limited to) when you don't know which `/gsd-*` command fits. It sizes the work and routes to the right lane.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/do.md
@~/.claude/get-shit-done/references/ui-brand.md
</execution_context>

<context>
$ARGUMENTS
</context>

<process>
Execute the do workflow from @~/.claude/get-shit-done/workflows/do.md end-to-end.
Route user intent to the best GSD command and invoke it.
</process>
