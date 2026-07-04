# GSD Agent Reference

> Full role cards for 14 primary agents plus concise stubs for 4 advanced/specialized agents (18 shipped agents total). The `agents/` directory and [`docs/INVENTORY.md`](INVENTORY.md) are the authoritative roster; see [Architecture](ARCHITECTURE.md) for context.

---

## Overview

GSD uses a multi-agent architecture where thin orchestrators (workflow files) spawn specialized agents with fresh context windows. Each agent has a focused role, limited tool access, and produces specific artifacts.

### Agent Categories

> The table below covers the **14 primary agents** detailed in this section. Four additional shipped agents (pattern-mapper, debug-session-manager, code-reviewer, code-fixer) have concise stubs in the [Advanced and Specialized Agents](#advanced-and-specialized-agents) section below. For the authoritative 18-agent roster, see [`docs/INVENTORY.md`](INVENTORY.md) and the `agents/` directory.

| Category | Count | Agents |
|----------|-------|--------|
| Researchers | 2 | project-researcher, phase-researcher |
| Analyzers | 2 | assumptions-analyzer, advisor-researcher |
| Synthesizers | 1 | research-synthesizer |
| Planners | 1 | planner |
| Roadmappers | 1 | roadmapper |
| Executors | 1 | executor |
| Checkers | 2 | plan-checker, integration-checker |
| Verifiers | 1 | verifier |
| Auditors | 1 | security-auditor |
| Mappers | 1 | codebase-mapper |
| Debuggers | 1 | debugger |

---

## Agent Details

### gsd-project-researcher

**Role:** Researches domain ecosystem before roadmap creation.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-new-project`, `/gsd-new-milestone` |
| **Parallelism** | 4 instances (stack, features, architecture, pitfalls) |
| **Tools** | Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp (context7) |
| **Model** | Opus |
| **Produces** | `.planning/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` |

**Capabilities:**
- Web search for current ecosystem information
- Context7 MCP integration for library documentation
- Writes research documents directly to disk (reduces orchestrator context load)

---

### gsd-phase-researcher

**Role:** Researches how to implement a specific phase before planning.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase` |
| **Parallelism** | 4 instances (same focus areas as project researcher) |
| **Tools** | Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp (context7) |
| **Model** | Opus |
| **Produces** | `{phase}-RESEARCH.md` |

**Capabilities:**
- Reads CONTEXT.md to focus research on user's decisions
- Investigates implementation patterns for the specific phase domain
- Detects existing test infrastructure and conventions

---

### gsd-assumptions-analyzer

**Role:** Deeply analyzes codebase for a phase and returns structured assumptions with evidence, confidence levels, and consequences if wrong.

| Property | Value |
|----------|-------|
| **Spawned by** | `discuss-phase-assumptions` workflow (when `workflow.discuss_mode = 'assumptions'`) |
| **Parallelism** | Single instance |
| **Tools** | Read, Bash, Grep, Glob |
| **Model** | Sonnet |
| **Color** | Cyan |
| **Produces** | Structured assumptions with decision statements, evidence file paths, confidence levels |

**Key behaviors:**
- Reads ROADMAP.md phase description and prior CONTEXT.md files
- Searches codebase for files related to the phase (components, patterns, similar features)
- Reads 5-15 most relevant source files to form evidence-based assumptions
- Classifies confidence: Confident (clear from code), Likely (reasonable inference), Unclear (could go multiple ways)
- Flags topics that need external research (library compatibility, ecosystem best practices)

---

### gsd-advisor-researcher

**Role:** Researches a single gray area decision during discuss-phase advisor mode and returns a structured comparison table.

| Property | Value |
|----------|-------|
| **Spawned by** | `discuss-phase` workflow (advisor mode is on by default; disabled via `--no-advisor`) |
| **Parallelism** | Multiple instances (one per gray area) |
| **Tools** | Read, Bash, Grep, Glob, WebSearch, WebFetch, mcp (context7) |
| **Model** | Sonnet |
| **Color** | Cyan |
| **Produces** | 5-column comparison table (Option / Pros / Cons / Complexity / Recommendation) with rationale paragraph |

**Key behaviors:**
- Researches a single assigned gray area using Claude's knowledge, Context7, and web search
- Produces genuinely viable options — no padding with filler alternatives
- Complexity column uses impact surface + risk (never time estimates)
- Recommendations are conditional ("Rec if X", "Rec if Y") — never single-winner ranking

---

### gsd-research-synthesizer

**Role:** Combines outputs from parallel researchers into a unified summary.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-new-project` (after 4 researchers complete) |
| **Parallelism** | Single instance (sequential after researchers) |
| **Tools** | Read, Write, Bash |
| **Model** | Sonnet |
| **Color** | Purple |
| **Produces** | `.planning/research/SUMMARY.md` |

---

### gsd-planner

**Role:** Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase`, `/gsd-quick` |
| **Parallelism** | Single instance |
| **Tools** | Read, Write, Bash, Glob, Grep, WebFetch, mcp (context7) |
| **Model** | Opus |
| **Color** | Green |
| **Produces** | `{phase}-{N}-PLAN.md` files |

**Key behaviors:**
- Reads PROJECT.md, REQUIREMENTS.md, CONTEXT.md, RESEARCH.md
- Creates 2-3 atomic task plans sized for single context windows
- Uses XML structure with `<task>` elements
- Includes `read_first` and `acceptance_criteria` sections
- Groups plans into dependency waves
- Performs reachability check to validate plan steps reference accessible files and APIs (v1.32)

---

### gsd-roadmapper

**Role:** Creates project roadmaps with phase breakdown and requirement mapping.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-new-project` |
| **Parallelism** | Single instance |
| **Tools** | Read, Write, Bash, Glob, Grep |
| **Model** | Opus |
| **Color** | Purple |
| **Produces** | `ROADMAP.md` |

**Key behaviors:**
- Maps requirements to phases (traceability)
- Derives success criteria from requirements
- Respects granularity setting for phase count
- Validates coverage (every v1 requirement mapped to a phase)

---

### gsd-executor

**Role:** Executes GSD plans with atomic commits, deviation handling, and checkpoint protocols.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-execute-phase`, `/gsd-quick` |
| **Parallelism** | Multiple (parallel within waves, sequential across waves) |
| **Tools** | Read, Write, Edit, Bash, Grep, Glob |
| **Model** | Sonnet |
| **Color** | Yellow |
| **Produces** | Code changes, git commits, `{phase}-{N}-SUMMARY.md` |

**Key behaviors:**
- Fresh 200K context window per plan
- Follows XML task instructions precisely
- Atomic git commit per completed task
- Handles checkpoint types: auto, human-verify, decision, human-action
- Reports deviations from plan in SUMMARY.md
- Invokes node repair on verification failure

---

### gsd-plan-checker

**Role:** Verifies plans will achieve phase goals before execution.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase` (verification loop, max 3 iterations) |
| **Parallelism** | Single instance (iterative) |
| **Tools** | Read, Bash, Glob, Grep |
| **Model** | Sonnet |
| **Color** | Green |
| **Produces** | PASS/FAIL verdict with specific feedback |

**7 Verification Dimensions:**
1. Requirement coverage
2. Task atomicity
3. Dependency ordering
4. File scope
5. Verification commands
6. Context fit
7. Gap detection

---

### gsd-integration-checker

**Role:** Verifies cross-phase integration and end-to-end flows.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-execute-phase` |
| **Parallelism** | Single instance |
| **Tools** | Read, Bash, Grep, Glob |
| **Model** | Sonnet |
| **Color** | Blue |
| **Produces** | Integration verification report |

---

### gsd-verifier

**Role:** Verifies phase goal achievement through goal-backward analysis.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-execute-phase` (after all executors complete) |
| **Parallelism** | Single instance |
| **Tools** | Read, Write, Bash, Grep, Glob |
| **Model** | Sonnet |
| **Color** | Green |
| **Produces** | `{phase}-VERIFICATION.md` |

**Key behaviors:**
- Checks codebase against phase goals, not just task completion
- PASS/FAIL with specific evidence
- Logs issues for `/gsd-verify-work` to address
- Milestone scope filtering: gaps addressed in later phases are marked as "deferred", not reported as failures (v1.32)
- **Test quality audit** (v1.32): verifies that tests prove what they claim by checking for disabled/skipped tests on requirements, circular test patterns (system generating its own expected values), assertion strength (existence vs. value vs. behavioral), and expected value provenance. Blockers from test quality audit override an otherwise passing verification

---

### gsd-codebase-mapper

**Role:** Explores codebase and writes structured analysis documents.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-map-codebase` |
| **Parallelism** | 4 instances (tech, architecture, quality, concerns) |
| **Tools** | Read, Bash, Grep, Glob, Write |
| **Model** | Sonnet |
| **Color** | Cyan |
| **Produces** | `.planning/codebase/*.md` (7 documents) |

**Key behaviors:**
- Read-only exploration + structured output
- Writes documents directly to disk
- No reasoning required — pattern extraction from file contents

---

### gsd-debugger

**Role:** Investigates bugs using scientific method with persistent state.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-debug`, `/gsd-verify-work` (for failures) |
| **Parallelism** | Single instance (interactive) |
| **Tools** | Read, Write, Edit, Bash, Grep, Glob, WebSearch |
| **Model** | Opus |
| **Color** | Orange |
| **Produces** | `.planning/debug/*.md`, knowledge-base updates |

**Debug Session Lifecycle:**
`gathering` → `investigating` → `fixing` → `verifying` → `awaiting_human_verify` → `resolved`

**Key behaviors:**
- Tracks hypotheses, evidence, and eliminated theories
- State persists across context resets
- Requires human verification before marking resolved
- Appends to persistent knowledge base on resolution
- Consults knowledge base on new sessions

---

### gsd-security-auditor

**Role:** Diff-scoped fallback security reviewer. Reviews a phase's real diff for security issues (OWASP-style) and returns severity-graded findings.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-execute-phase` (`security_review_gate` step, governed by `workflow.security_review`) |
| **Parallelism** | Single instance |
| **Tools** | Read, Bash, Glob, Grep |
| **Model** | Sonnet |
| **Color** | `#EF4444` (red) |
| **Produces** | Severity-graded findings (BLOCKER / WARNING) returned to the orchestrator |

**Key behaviors:**
- Reviews exactly what changed in the phase — the changed-file list and its git diff, not the whole codebase
- Fallback reviewer: runs only when no dedicated security-review skill is installed in the user's environment
- Advisory — findings inform the developer; they never block execution flow
- Implementation files are read-only — never patches code

---

## Advanced and Specialized Agents

Four additional agents ship under `agents/gsd-*.md` and are used by specialty workflows (`/gsd-code-review`, `/gsd-code-review-fix`, `/gsd-debug`) and by the planner pipeline. Each carries full frontmatter in its agent file; the stubs below are concise by design. The authoritative roster (with spawner and primary-doc status per agent) lives in [`docs/INVENTORY.md`](INVENTORY.md).

### gsd-pattern-mapper

**Role:** Read-only codebase analysis that maps files-to-be-created or modified to their closest existing analogs, producing `PATTERNS.md` for the planner to consume.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase` (between research and planning) |
| **Parallelism** | Single instance |
| **Tools** | Read, Bash, Glob, Grep, Write |
| **Model** | Sonnet |
| **Color** | Magenta |
| **Produces** | `PATTERNS.md` in the phase directory |

**Key behaviors:**
- Extracts file list from CONTEXT.md and RESEARCH.md; classifies each by role (controller, component, service, model, middleware, utility, config, test) and data flow (CRUD, streaming, file I/O, event-driven, request-response)
- Searches for the closest existing analog per file and extracts concrete code excerpts (imports, auth patterns, core pattern, error handling)
- Strictly read-only against source; only writes `PATTERNS.md`

---

### gsd-debug-session-manager

**Role:** Runs the full `/gsd-debug` checkpoint-and-continuation loop in an isolated context so the orchestrator's main context stays lean; spawns `gsd-debugger` agents, dispatches specialist skills, and handles user checkpoints via AskUserQuestion.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-debug` |
| **Parallelism** | Single instance (interactive, stateful) |
| **Tools** | Read, Write, Bash, Grep, Glob, Task, AskUserQuestion |
| **Model** | Sonnet |
| **Color** | Orange |
| **Produces** | Compact summary returned to main context; evolves the `.planning/debug/{slug}.md` session file |

**Key behaviors:**
- Reads the debug session file first; passes file paths (not inlined contents) to spawned agents to respect context budget
- Treats all user-supplied AskUserQuestion content as data-only, wrapped in DATA_START/DATA_END markers
- Coordinates TDD gates and reasoning checkpoints introduced in v1.36.0

---

### gsd-code-reviewer

**Role:** Reviews source files for bugs, security vulnerabilities, and code-quality problems; produces a structured `REVIEW.md` with severity-classified findings.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-code-review` |
| **Parallelism** | Typically single instance per review scope |
| **Tools** | Read, Write, Bash, Grep, Glob |
| **Model** | Sonnet |
| **Color** | `#F59E0B` (amber) |
| **Produces** | `REVIEW.md` in the phase directory |

**Key behaviors:**
- Detects bugs (logic errors, null/undefined checks, off-by-one, type mismatches, unreachable code), security issues (injection, XSS, hardcoded secrets, insecure crypto), and quality issues
- Honors `CLAUDE.md` project conventions and `.claude/skills/` / `.agents/skills/` rules when present
- Read-only against implementation source — never modifies code under review

---

### gsd-code-fixer

**Role:** Applies fixes to findings from `REVIEW.md` with intelligent (non-blind) patching and atomic per-fix commits; produces `REVIEW-FIX.md`.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-code-review-fix` |
| **Parallelism** | Single instance |
| **Tools** | Read, Edit, Write, Bash, Grep, Glob |
| **Model** | Sonnet |
| **Color** | `#10B981` (emerald) |
| **Produces** | `REVIEW-FIX.md`; one atomic git commit per applied fix |

**Key behaviors:**
- Treats `REVIEW.md` suggestions as guidance, not a patch to apply literally
- Commits each fix atomically so review and rollback stay granular
- Honors `CLAUDE.md` and project-skill rules during fixes

---

## Agent Tool Permissions Summary

> **Scope:** this table covers the 14 primary agents only. The 4 advanced/specialized agents listed above carry their own tool surfaces in their `agents/gsd-*.md` frontmatter (summarized in the per-agent stubs above and in [`docs/INVENTORY.md`](INVENTORY.md)).

| Agent | Read | Write | Edit | Bash | Grep | Glob | WebSearch | WebFetch | MCP |
|-------|------|-------|------|------|------|------|-----------|----------|-----|
| project-researcher | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| phase-researcher | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| assumptions-analyzer | ✓ | | | ✓ | ✓ | ✓ | | | |
| advisor-researcher | ✓ | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| research-synthesizer | ✓ | ✓ | | ✓ | | | | | |
| planner | ✓ | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ |
| roadmapper | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| executor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| plan-checker | ✓ | | | ✓ | ✓ | ✓ | | | |
| integration-checker | ✓ | | | ✓ | ✓ | ✓ | | | |
| verifier | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| codebase-mapper | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| debugger | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| security-auditor | ✓ | | | ✓ | ✓ | ✓ | | | |

**Principle of Least Privilege:**
- Checkers and auditors are read-only (no Write/Edit) — they evaluate, never modify
- Researchers have web access — they need current ecosystem information
- Executors have Edit — they modify code but not web access
- Mappers have Write — they write analysis documents but not Edit (no code changes)
