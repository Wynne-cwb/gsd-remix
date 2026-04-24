# Agent Operating Notes

## Long-Lived Task Context

This repo uses a lightweight context handoff protocol so future coding sessions can recover the current collaboration state without replaying the whole chat history.

### Files

- `AGENTS.md`: stable collaboration rules and operating protocol. Keep this file mostly static.
- `ROADMAP.md`: root-level collaboration dashboard. This is the first short context file to read when resuming work.
- `handoff/<slug>.md`: optional long-form handoff files for complex decisions, contracts, diagnostics, or issue discussions that would make `ROADMAP.md` too large.

The root `ROADMAP.md` is not the same as any GSD-managed `.planning/ROADMAP.md`. The root file is conversation-oriented and tracks the human-agent collaboration state. `.planning/ROADMAP.md` is project/phase-oriented and belongs to the GSD workflow.

### Session Start

At the start of a new session:

1. Read root `ROADMAP.md` if it exists.
2. Read only the `handoff/*.md` files explicitly marked as active in `ROADMAP.md`.
3. If the task is inside a GSD workflow, inspect the relevant `.planning/STATE.md`, `.planning/ROADMAP.md`, or phase artifacts only as needed.

Do not eagerly load historical handoff files. Treat them as lazy references unless the current task needs their details.

### ROADMAP.md Shape

Keep root `ROADMAP.md` under 100 lines when possible. Use four sections:

1. `当前焦点`: the 1-3 most important active work items.
2. `活跃问题`: only issues/blockers that affect the next action.
3. `最近决策`: rolling list of the latest 5 important decisions, each with date and rationale.
4. `下次 session 继续点`: the minimal startup snapshot, including active handoff links if any.

If a section starts growing, move the long explanation to `handoff/<slug>.md` and leave only a short link plus status in `ROADMAP.md`.

### Update Rules

Update root `ROADMAP.md` when:

- A major decision is made, including naming, release, architecture, or workflow strategy.
- A GSD phase changes gate/status, such as discuss, plan, execute, verify, secure, or complete.
- Scope expands, such as inserting a new phase, adding a new feature track, or changing the milestone boundary.
- A new active handoff is created or an old active handoff is no longer needed.
- A new blocker appears, an existing blocker is resolved, or the next action changes materially.
- The user asks to remember something or says the session may pause.
- Context is getting close to its limit and the next session needs a reliable continuation point.

Do not update root `ROADMAP.md` for every tool call, short-lived experiment, or idea that is later superseded. If the same information already lives in `.planning/`, docs, commits, or another durable artifact, reference it instead of copying it.

### Handoff Rules

Create `handoff/<slug>.md` only when the content is too long or too important for `ROADMAP.md`. Good candidates are canonical contracts, multi-step diagnostics, cross-phase decisions, and long tradeoff analysis.

Only active handoffs should appear in `ROADMAP.md` startup notes. Completed or historical handoffs should be read lazily when a future task explicitly needs that context.
