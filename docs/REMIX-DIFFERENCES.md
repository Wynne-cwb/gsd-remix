# Remix Differences

This document tracks the ways `gsd-remix` intentionally diverges from upstream GSD.

## Scope

Record changes here when they affect one or more of:

- npm/package identity
- installer behavior
- workflow behavior
- query/SDK behavior
- memory/state artifacts
- default routing or token budget behavior
- compatibility guarantees or deliberate compatibility breaks

Pure refactors with no externally observable behavior change do not need an entry unless they are part of a remix-specific feature.

## Recording Rule

When this remix changes upstream behavior, add a new entry here with:

- date
- area
- summary of the change
- rationale
- key files
- compatibility impact

Keep entries high-signal. This file is for maintained deltas from upstream, not a full changelog.

## Compatibility Baseline

`gsd-remix` aims to keep:

- the `/gsd-*` command surface
- the `.planning/` project layout
- the core workflow filenames
- the broad execution model of discuss → plan → execute → verify

This lets the remix stay close to upstream usage patterns while still making opinionated changes.

## Current Deltas

### 2026-04-23 — Package Identity

- **Area:** Packaging / distribution
- **Change:** Publish independently as `gsd-remix`
- **Rationale:** Make the fork identity explicit on npm without changing the internal `/gsd-*` command surface or core planning layout
- **Key files:** [package.json](../package.json), [README.md](../README.md)
- **Compatibility impact:** Low. Runtime commands and repo structure stay aligned with upstream; npm install/publish identity changes.

### 2026-04-23 — Discuss History Token Optimization

- **Area:** Workflow behavior / token budget
- **Change:** `discuss-phase` and `discuss-phase-power` load prior phase context summary-first instead of eagerly reading all historical `CONTEXT.md` files
- **Rationale:** Reduce context growth while preserving quality by escalating to full history only when conflicts or strong relevance signals appear
- **Key files:** [get-shit-done/workflows/discuss-phase.md](../get-shit-done/workflows/discuss-phase.md), [get-shit-done/workflows/discuss-phase-power.md](../get-shit-done/workflows/discuss-phase-power.md), [sdk/src/query/context-history.ts](../sdk/src/query/context-history.ts)
- **Compatibility impact:** Medium. Same workflow purpose and outputs, but history-loading behavior is more selective than upstream.

### 2026-04-23 — Dynamic Inline Routing For Small Plans

- **Area:** Execute routing / token budget
- **Change:** Keep `inline_plan_threshold = 2`, but allow a conservative low-complexity override for some `3-5` task plans via deterministic routing logic
- **Rationale:** Avoid unnecessary subagent overhead for small, low-risk plans without broadly changing upstream execution semantics
- **Key files:** [get-shit-done/workflows/execute-plan.md](../get-shit-done/workflows/execute-plan.md), [sdk/src/query/plan-execution-route.ts](../sdk/src/query/plan-execution-route.ts)
- **Compatibility impact:** Medium. Execution routing can differ from upstream in bounded low-complexity cases.
