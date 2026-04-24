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

### 2026-04-23 — SDK Namespace Isolation

- **Area:** SDK packaging / installer behavior
- **Change:** Rename the bundled SDK package identity and binary from `@gsd-build/sdk` / `gsd-sdk` to `@gsd-remix/sdk` / `gsd-remix-sdk`, and migrate workflows plus runtime preflights to the new binary
- **Rationale:** Prevent the remix SDK from colliding with upstream global installs while keeping the `/gsd-*` command surface unchanged
- **Key files:** [sdk/package.json](../sdk/package.json), [sdk/package-lock.json](../sdk/package-lock.json), [bin/install.js](../bin/install.js), [get-shit-done/workflows/health.md](../get-shit-done/workflows/health.md), [README.md](../README.md)
- **Compatibility impact:** Medium. Fresh `gsd-remix` installs now rely on `gsd-remix-sdk`; users with tooling that shells out to `gsd-sdk` must switch to the remix binary.

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

### 2026-04-23 — Failure Memory Event Capture

- **Area:** Memory / self-evolution groundwork
- **Change:** Add failure event capture into `.planning/failure-memory/events.jsonl`
- **Rationale:** Create a structured, machine-readable evidence trail for repeated failures before building any higher-level “self-evolution” or long-term memory promotion logic
- **Key files:** [sdk/src/failure-memory.ts](../sdk/src/failure-memory.ts), [sdk/src/query/failure-capture.ts](../sdk/src/query/failure-capture.ts), [sdk/src/phase-runner.ts](../sdk/src/phase-runner.ts), [get-shit-done/workflows/execute-phase.md](../get-shit-done/workflows/execute-phase.md)
- **Compatibility impact:** Low. This is additive and non-blocking; it records failures without changing success criteria.

### 2026-04-23 — Failure Memory Promotion

- **Area:** Memory / self-evolution behavior
- **Change:** Promote repeated failure signatures and explicit blocking anti-patterns into `.planning/failure-memory/index.json`, `.planning/FAILURE-MEMORY.md`, and `FM-xxx.md` detail files
- **Rationale:** Move from raw event capture to project-local, reviewable long-term memory without feeding more context back into prompts by default
- **Key files:** [sdk/src/failure-memory.ts](../sdk/src/failure-memory.ts), [sdk/src/query/failure-capture.ts](../sdk/src/query/failure-capture.ts), [get-shit-done/workflows/execute-phase.md](../get-shit-done/workflows/execute-phase.md)
- **Compatibility impact:** Low to medium. The remix now persists higher-level failure memory artifacts after phase execution, but this remains additive and non-blocking.

### 2026-04-23 — Failure-Memory Execute Preflight

- **Area:** Execute guardrails / self-evolution behavior
- **Change:** Add `failure.preflight` and call it from `execute-plan` before task execution so promoted failure memories can compile into deterministic environment/package-manager/script/env checks
- **Rationale:** Use past failures to prevent repeated execution mistakes without inflating prompt context or requiring the model to read long historical memory entries
- **Key files:** [sdk/src/failure-memory.ts](../sdk/src/failure-memory.ts), [sdk/src/query/failure-capture.ts](../sdk/src/query/failure-capture.ts), [get-shit-done/workflows/execute-plan.md](../get-shit-done/workflows/execute-plan.md)
- **Compatibility impact:** Medium. Execution may now stop earlier for strong environment mismatches that upstream would only discover during task execution.

### 2026-04-23 — Runtime Health Preflight

- **Area:** Runtime diagnostics / workflow guardrails
- **Change:** Add deterministic `runtime.health` / `sdk.health` checks in the SDK, run them automatically at the start of `discuss-phase`, `plan-phase`, and `execute-phase`, and expose them explicitly via `/gsd-health --runtime`
- **Rationale:** Catch broken installs, unsupported Node runtimes, and missing `gsd-tools.cjs` bridge assets before workflows degrade into manual fallback or opaque shell failures
- **Key files:** [sdk/src/runtime-health.ts](../sdk/src/runtime-health.ts), [sdk/src/query/runtime-health.ts](../sdk/src/query/runtime-health.ts), [get-shit-done/workflows/discuss-phase.md](../get-shit-done/workflows/discuss-phase.md), [get-shit-done/workflows/plan-phase.md](../get-shit-done/workflows/plan-phase.md), [get-shit-done/workflows/execute-phase.md](../get-shit-done/workflows/execute-phase.md)
- **Compatibility impact:** Medium. The remix now fails fast on unsupported Node versions or mismatched runtime installs instead of continuing into degraded execution paths.

### 2026-04-24 — Bundled SDK Runtime Repair

- **Area:** Runtime repair / installer behavior
- **Change:** Install a bundled SDK source snapshot into `get-shit-done/sdk/` and add `get-shit-done/bin/repair-sdk.cjs`, allowing `/gsd-health --runtime --repair` to rebuild `gsd-remix-sdk` without publishing or fetching a separate SDK package
- **Rationale:** Keep `gsd-remix` as a single npm package while preserving a real SDK repair path when the SDK CLI is missing, stale, or unable to answer health queries
- **Key files:** [bin/install.js](../bin/install.js), [get-shit-done/bin/repair-sdk.cjs](../get-shit-done/bin/repair-sdk.cjs), [get-shit-done/workflows/health.md](../get-shit-done/workflows/health.md), [docs/COMMANDS.md](COMMANDS.md)
- **Compatibility impact:** Low to medium. Runtime installs include a larger `get-shit-done/` payload, but SDK repair no longer depends on a separately published `@gsd-remix/sdk` package.

### 2026-04-24 — Runtime Identity Marker

- **Area:** Runtime diagnostics / install confidence
- **Change:** Write `get-shit-done/IDENTITY.json` during install and surface it through `runtime.health` / `/gsd-health --runtime`
- **Rationale:** Let users confirm that shared `/gsd-*` commands resolve to `gsd-remix` rather than stale upstream GSD assets
- **Key files:** [bin/install.js](../bin/install.js), [sdk/src/runtime-health.ts](../sdk/src/runtime-health.ts), [get-shit-done/workflows/health.md](../get-shit-done/workflows/health.md), [README.md](../README.md)
- **Compatibility impact:** Low. The marker is additive; missing or unexpected identity markers appear as runtime warnings.

### 2026-04-23 — Statusline Compact Phase + Rate Limits

- **Area:** Hook behavior / developer UX
- **Change:** Update `gsd-statusline.js` to render compact phase progress as `ph N/M` and append colored `5h / 7d` rate-limit indicators when the runtime provides them
- **Rationale:** Keep the statusline readable in narrow terminals while surfacing rate-budget pressure directly in the user-facing status bar
- **Key files:** [hooks/gsd-statusline.js](../hooks/gsd-statusline.js)
- **Compatibility impact:** Low. The hook remains backward compatible; it only changes the rendered statusline text when phase or rate-limit data is available.
