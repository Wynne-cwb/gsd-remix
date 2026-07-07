# GSD Shipped Surface Inventory

> Authoritative roster of every shipped GSD surface: commands, agents, workflows, references, CLI modules, and hooks. Where the broad docs (AGENTS.md, COMMANDS.md, ARCHITECTURE.md, CLI-TOOLS.md) diverge from the filesystem, treat this file and the repository tree itself as the source of truth.

## How To Use This File

- Counts here are derived from the filesystem at the v1.36.0 pin and may drift between releases. For live counts, run `ls commands/gsd/*.md | wc -l`, `ls agents/gsd-*.md | wc -l`, etc. against the checkout.
- This file enumerates every shipped surface across all six families (agents, commands, workflows, references, CLI modules, hooks). Broad docs may render narrative or curated subsets; when they disagree with the filesystem, this file and the directory listings are authoritative.
- New surfaces added after v1.36.0 should land here first, then propagate to the broad docs. The drift-control tests in `tests/inventory-counts.test.cjs`, `tests/commands-doc-parity.test.cjs`, `tests/agents-doc-parity.test.cjs`, `tests/cli-modules-doc-parity.test.cjs`, `tests/hooks-doc-parity.test.cjs`, `tests/architecture-counts.test.cjs`, and `tests/command-count-sync.test.cjs` anchor the counts and roster contents against the filesystem.

---

## Agents (18 shipped)

Full roster at `agents/gsd-*.md`. The "Primary doc" column flags whether [`docs/AGENTS.md`](AGENTS.md) carries a full role card (*primary*), a short stub in the "Advanced and Specialized Agents" section (*advanced stub*), or no coverage (*inventory only*).

| Agent | Role (one line) | Spawned by | Primary doc |
|-------|-----------------|------------|-------------|
| gsd-project-researcher | Researches domain ecosystem before roadmap creation (stack, features, architecture, pitfalls). | `/gsd-new-project`, `/gsd-new-milestone` | primary |
| gsd-phase-researcher | Researches implementation approach for a specific phase before planning. | `/gsd-plan-phase` | primary |
| gsd-assumptions-analyzer | Produces evidence-backed assumptions for discuss-phase (assumptions mode). | `discuss-phase-assumptions` workflow | primary |
| gsd-advisor-researcher | Researches a single gray-area decision during discuss-phase advisor mode. | `discuss-phase` workflow (advisor mode) | primary |
| gsd-research-synthesizer | Combines parallel researcher outputs into a unified SUMMARY.md. | `/gsd-new-project` | primary |
| gsd-planner | Creates executable phase plans with task breakdown and goal-backward verification. | `/gsd-plan-phase`, `/gsd-quick` | primary |
| gsd-roadmapper | Creates project roadmaps with phase breakdown and requirement mapping. | `/gsd-new-project` | primary |
| gsd-executor | Executes GSD plans with atomic commits and deviation handling. | `/gsd-execute-phase`, `/gsd-quick` | primary |
| gsd-plan-checker | Verifies plans will achieve phase goals (8 verification dimensions). | `/gsd-plan-phase` (verification loop) | primary |
| gsd-integration-checker | Verifies cross-phase integration and end-to-end flows. | `/gsd-execute-phase` | primary |
| gsd-verifier | Verifies phase goal achievement through goal-backward analysis. | `/gsd-execute-phase` | primary |
| gsd-codebase-mapper | Explores codebase and writes structured analysis documents. | `/gsd-map-codebase` | primary |
| gsd-debugger | Investigates bugs using scientific method with persistent state. | `/gsd-debug`, `/gsd-verify-work` | primary |
| gsd-security-auditor | Diff-scoped OWASP-style security review with severity-graded findings (generic fallback when no company security skill is installed). | `/gsd-execute-phase` (security_review_gate) | primary |
| gsd-pattern-mapper | Maps new files to closest existing analogs; writes PATTERNS.md for the planner. | `/gsd-plan-phase` (between research and planning) | advanced stub |
| gsd-debug-session-manager | Runs the full `/gsd-debug` checkpoint-and-continuation loop in isolated context so main stays lean. | `/gsd-debug` | advanced stub |
| gsd-code-reviewer | Reviews source files for bugs, security issues, and code-quality problems; produces REVIEW.md. | `/gsd-code-review` | advanced stub |
| gsd-code-fixer | Applies fixes to REVIEW.md findings with atomic per-fix commits; produces REVIEW-FIX.md. | `/gsd-code-review-fix` | advanced stub |

**Coverage note.** `docs/AGENTS.md` gives full role cards for 21 primary agents plus concise stubs for the 12 advanced agents. The Agent Tool Permissions Summary in that file covers only the primary 21 agents; the advanced agents' tool lists are captured in their per-agent frontmatter in `agents/gsd-*.md`.

---

## Commands (37 shipped)

Full roster at `commands/gsd/*.md`. The groupings below mirror `docs/COMMANDS.md` section order; each row carries the command name, a one-line role derived from the command's frontmatter `description:`, and a link to the source file. `tests/command-count-sync.test.cjs` locks the count against the filesystem.

### Core Workflow

| Command | Role | Source |
|---------|------|--------|
| `/gsd-new-project` | Initialize a new project with deep context gathering and PROJECT.md. | [commands/gsd/new-project.md](../commands/gsd/new-project.md) |
| `/gsd-discuss-phase` | Gather phase context through adaptive questioning before planning. | [commands/gsd/discuss-phase.md](../commands/gsd/discuss-phase.md) |
| `/gsd-plan-phase` | Create detailed phase plan (PLAN.md) with verification loop. | [commands/gsd/plan-phase.md](../commands/gsd/plan-phase.md) |
| `/gsd-research-phase` | Research how to implement a phase (standalone). | [commands/gsd/research-phase.md](../commands/gsd/research-phase.md) |
| `/gsd-execute-phase` | Execute all plans in a phase with wave-based parallelization. | [commands/gsd/execute-phase.md](../commands/gsd/execute-phase.md) |
| `/gsd-verify-work` | Validate built features through conversational UAT with auto-diagnosis. | [commands/gsd/verify-work.md](../commands/gsd/verify-work.md) |
| `/gsd-next` | Automatically advance to the next logical step in the GSD workflow. | [commands/gsd/next.md](../commands/gsd/next.md) |
| `/gsd-fast` | Execute a trivial task inline — no subagents, no planning overhead. | [commands/gsd/fast.md](../commands/gsd/fast.md) |
| `/gsd-quick` | Execute a quick task with GSD guarantees (atomic commits, state tracking) but skip optional agents. | [commands/gsd/quick.md](../commands/gsd/quick.md) |
| `/gsd-escalate` | Escalate a completed quick task into a heavy phase, carrying its work forward as evidence (quick → heavy). | [commands/gsd/escalate.md](../commands/gsd/escalate.md) |
| `/gsd-brainstorm` | Converge a rough idea into an approved PRD (requirement-level clarification) before a milestone or phase. | [commands/gsd/brainstorm.md](../commands/gsd/brainstorm.md) |
| `/gsd-code-review` | Review source files changed during a phase for bugs, security, and code-quality problems. | [commands/gsd/code-review.md](../commands/gsd/code-review.md) |
| `/gsd-code-review-fix` | Auto-fix issues found by `/gsd-code-review`, committing each fix atomically. | [commands/gsd/code-review-fix.md](../commands/gsd/code-review-fix.md) |

### Phase & Milestone Management

| Command | Role | Source |
|---------|------|--------|
| `/gsd-add-phase` | Add phase to end of current milestone in roadmap. | [commands/gsd/add-phase.md](../commands/gsd/add-phase.md) |
| `/gsd-insert-phase` | Insert urgent work as decimal phase (e.g., 72.1) between existing phases. | [commands/gsd/insert-phase.md](../commands/gsd/insert-phase.md) |
| `/gsd-remove-phase` | Remove a future phase from roadmap and renumber subsequent phases. | [commands/gsd/remove-phase.md](../commands/gsd/remove-phase.md) |
| `/gsd-add-tests` | Generate tests for a completed phase based on UAT criteria and implementation. | [commands/gsd/add-tests.md](../commands/gsd/add-tests.md) |
| `/gsd-complete-milestone` | Archive completed milestone and prepare for next version. | [commands/gsd/complete-milestone.md](../commands/gsd/complete-milestone.md) |
| `/gsd-new-milestone` | Start a new milestone cycle — update PROJECT.md and route to requirements. | [commands/gsd/new-milestone.md](../commands/gsd/new-milestone.md) |
| `/gsd-cleanup` | Archive accumulated phase directories from completed milestones. | [commands/gsd/cleanup.md](../commands/gsd/cleanup.md) |
| `/gsd-autonomous` | Run all remaining phases autonomously — discuss → plan → execute per phase. | [commands/gsd/autonomous.md](../commands/gsd/autonomous.md) |
| `/gsd-undo` | Safe git revert — roll back phase or plan commits using the phase manifest. | [commands/gsd/undo.md](../commands/gsd/undo.md) |

### Session & Navigation

| Command | Role | Source |
|---------|------|--------|
| `/gsd-progress` | Check project progress, show context, and route to next action. | [commands/gsd/progress.md](../commands/gsd/progress.md) |
| `/gsd-pause-work` | Create context handoff when pausing work mid-phase. | [commands/gsd/pause-work.md](../commands/gsd/pause-work.md) |
| `/gsd-resume-work` | Resume work from previous session with full context restoration. | [commands/gsd/resume-work.md](../commands/gsd/resume-work.md) |
| `/gsd-do` | Route freeform text to the right GSD command automatically. | [commands/gsd/do.md](../commands/gsd/do.md) |
| `/gsd-note` | Zero-friction idea capture — append, list, or promote notes to todos. | [commands/gsd/note.md](../commands/gsd/note.md) |
| `/gsd-add-todo` | Capture idea or task as todo from current conversation context. | [commands/gsd/add-todo.md](../commands/gsd/add-todo.md) |
| `/gsd-check-todos` | List pending todos and select one to work on. | [commands/gsd/check-todos.md](../commands/gsd/check-todos.md) |
| `/gsd-add-backlog` | Add an idea to the backlog parking lot (999.x numbering). | [commands/gsd/add-backlog.md](../commands/gsd/add-backlog.md) |
| `/gsd-review-backlog` | Review and promote backlog items to active milestone. | [commands/gsd/review-backlog.md](../commands/gsd/review-backlog.md) |

### Codebase Intelligence

| Command | Role | Source |
|---------|------|--------|
| `/gsd-map-codebase` | Analyze codebase with parallel mapper agents; produces `.planning/codebase/` documents. | [commands/gsd/map-codebase.md](../commands/gsd/map-codebase.md) |

### Review, Debug & Recovery

| Command | Role | Source |
|---------|------|--------|
| `/gsd-debug` | Systematic debugging with persistent state across context resets. | [commands/gsd/debug.md](../commands/gsd/debug.md) |
| `/gsd-health` | Diagnose planning directory health and optionally repair issues. | [commands/gsd/health.md](../commands/gsd/health.md) |

### Docs, Profile & Utilities

| Command | Role | Source |
|---------|------|--------|
| `/gsd-settings` | Configure GSD workflow toggles and model profile. | [commands/gsd/settings.md](../commands/gsd/settings.md) |
| `/gsd-pr-branch` | Create a clean PR branch by filtering out `.planning/` commits. | [commands/gsd/pr-branch.md](../commands/gsd/pr-branch.md) |
| `/gsd-help` | Show available GSD commands and usage guide. | [commands/gsd/help.md](../commands/gsd/help.md) |

---

## Workflows (43 shipped)

Full roster at `get-shit-done/workflows/*.md`. Workflows are thin orchestrators that commands reference internally; most are not read directly by end users. Rows below map each workflow file to its role (derived from the `<purpose>` block) and, where applicable, to the command that invokes it.

| Workflow | Role | Invoked by |
|----------|------|------------|
| `add-phase.md` | Add a new integer phase to the end of the current milestone in the roadmap. | `/gsd-add-phase` |
| `add-tests.md` | Generate unit and E2E tests for a completed phase based on its artifacts. | `/gsd-add-tests` |
| `escalate.md` | Escalate a completed quick task into a heavy phase, seeding it with prior context/commits as evidence (quick → heavy). | `/gsd-escalate` |
| `brainstorm.md` | Converge a rough idea into an approved PRD (requirement-level clarification), gated at the PRD. | `/gsd-brainstorm` |
| `add-todo.md` | Capture an idea or task that surfaces during a session as a structured todo. | `/gsd-add-todo`, `/gsd-add-backlog` |
| `autonomous.md` | Drive milestone phases autonomously — all remaining, a range, or a single phase. | `/gsd-autonomous` |
| `check-todos.md` | List pending todos, allow selection, load context, and route to the appropriate action. | `/gsd-check-todos` |
| `cleanup.md` | Archive accumulated phase directories from completed milestones. | `/gsd-cleanup` |
| `code-review-fix.md` | Auto-fix issues from REVIEW.md via gsd-code-fixer with per-fix atomic commits. | `/gsd-code-review-fix` |
| `code-review.md` | Review phase source changes via gsd-code-reviewer; produces REVIEW.md. | `/gsd-code-review` |
| `complete-milestone.md` | Mark a shipped version as complete — MILESTONES.md entry, PROJECT.md evolution, tag. | `/gsd-complete-milestone` |
| `diagnose-issues.md` | Orchestrate parallel debug agents to investigate UAT gaps and find root causes. | `/gsd-verify-work` (auto-diagnosis) |
| `discovery-phase.md` | Execute discovery at the appropriate depth level. | `/gsd-new-project` (discovery path) |
| `discuss-phase-assumptions.md` | Assumptions-mode discuss — extract implementation decisions via codebase-first analysis. | `/gsd-discuss-phase` (when `discuss_mode=assumptions`) |
| `discuss-phase-power.md` | Power-user discuss — pre-generate all questions into a JSON state file + HTML UI. | `/gsd-discuss-phase --power` |
| `discuss-phase.md` | Extract implementation decisions through iterative gray-area discussion. | `/gsd-discuss-phase` |
| `do.md` | Route freeform text from the user to the best matching GSD command. | `/gsd-do` |
| `execute-phase.md` | Execute all plans in a phase using wave-based parallel execution. | `/gsd-execute-phase` |
| `execute-plan.md` | Execute a phase prompt (PLAN.md) and create the outcome summary (SUMMARY.md). | `execute-phase.md` (per-plan subagent) |
| `fast.md` | Execute a trivial task inline without subagent overhead. | `/gsd-fast` |
| `graduation.md` | Cluster recurring LEARNINGS.md items across phases and surface HITL promotion candidates. | `transition.md` (graduation_scan step) |
| `health.md` | Validate `.planning/` directory integrity and report actionable issues. | `/gsd-health` |
| `help.md` | Display the complete GSD command reference. | `/gsd-help` |
| `insert-phase.md` | Insert a decimal phase for urgent work discovered mid-milestone. | `/gsd-insert-phase` |
| `map-codebase.md` | Orchestrate parallel codebase mapper agents to produce `.planning/codebase/` docs. | `/gsd-map-codebase` |
| `new-milestone.md` | Start a new milestone cycle — load project context, gather goals, update PROJECT.md/STATE.md. | `/gsd-new-milestone` |
| `new-project.md` | Unified new-project flow — questioning, research (optional), requirements, roadmap. | `/gsd-new-project` |
| `next.md` | Detect current project state and automatically advance to the next logical step. | `/gsd-next` |
| `node-repair.md` | Autonomous repair operator for failed task verification; invoked by `execute-plan`. | `execute-plan.md` (recovery) |
| `note.md` | Zero-friction idea capture — one Write call, one confirmation line. | `/gsd-note` |
| `pause-work.md` | Create structured `.planning/HANDOFF.json` and `.continue-here.md` handoff files. | `/gsd-pause-work` |
| `plan-phase.md` | Create executable PLAN.md files with integrated research and verification loop. | `/gsd-plan-phase`, `/gsd-quick` |
| `pr-branch.md` | Create a clean branch for pull requests by filtering `.planning/` commits. | `/gsd-pr-branch` |
| `progress.md` | Progress rendering — project context, position, and next-action routing. | `/gsd-progress` |
| `quick.md` | Quick-task execution with GSD guarantees (atomic commits, state tracking). | `/gsd-quick` |
| `remove-phase.md` | Remove a future phase from the roadmap and renumber subsequent phases. | `/gsd-remove-phase` |
| `research-phase.md` | Standalone phase research workflow (usually invoked via `plan-phase`). | `/gsd-research-phase` |
| `resume-project.md` | Resume work — restore full context from STATE.md, HANDOFF.json, and artifacts. | `/gsd-resume-work` |
| `settings.md` | Configure GSD workflow toggles and model profile. | `/gsd-settings` |
| `transition.md` | Phase-boundary transition workflow — state advancement. | `execute-phase.md`, `/gsd-next` |
| `undo.md` | Safe git revert — phase or plan commits using the phase manifest. | `/gsd-undo` |
| `verify-phase.md` | Verify phase goal achievement through goal-backward analysis. | `execute-phase.md` (post-execution) |
| `verify-work.md` | Conversational UAT with auto-diagnosis — produces UAT.md and fix plans. | `/gsd-verify-work` |

> **Note:** Some workflows have no direct user-facing command (e.g. `execute-plan.md`, `verify-phase.md`, `transition.md`, `node-repair.md`, `diagnose-issues.md`) — they are invoked internally by orchestrator workflows. `discovery-phase.md` is an alternate entry for `/gsd-new-project`.

---

## References (36 shipped)

Full roster at `get-shit-done/references/*.md`. References are shared knowledge documents that workflows and agents `@-reference`. The groupings below match [`docs/ARCHITECTURE.md`](ARCHITECTURE.md#references-get-shit-donereferencesmd) — core, workflow clusters, and the modular planner decomposition.

### Core References

| Reference | Role |
|-----------|------|
| `checkpoints.md` | Checkpoint type definitions and interaction patterns. |
| `gates.md` | 4 canonical gate types (Confirm, Quality, Safety, Transition) wired into plan-checker and verifier. |
| `model-profiles.md` | Per-agent model tier assignments. |
| `verification-patterns.md` | How to verify different artifact types. |
| `verification-overrides.md` | Per-artifact verification override rules. |
| `planning-config.md` | Full config schema and behavior. |
| `git-integration.md` | Git commit, branching, and history patterns. |
| `git-planning-commit.md` | Planning directory commit conventions. |
| `questioning.md` | Dream-extraction philosophy for project initialization. |
| `tdd.md` | Test-driven development integration patterns. |
| `ui-brand.md` | Visual output formatting patterns. |
| `common-bug-patterns.md` | Common bug patterns for code review and verification. |
| `debugger-philosophy.md` | Evergreen debugging disciplines loaded by `gsd-debugger`. |
| `mandatory-initial-read.md` | Shared required-reading boilerplate injected into agent prompts. |
| `project-skills-discovery.md` | Shared project-skills-discovery boilerplate injected into agent prompts. |

### Workflow References

| Reference | Role |
|-----------|------|
| `agent-contracts.md` | Formal interface between orchestrators and agents. |
| `context-budget.md` | Context window budget allocation rules. |
| `continuation-format.md` | Session continuation/resume format. |
| `domain-probes.md` | Domain-specific probing questions for discuss-phase. |
| `gate-prompts.md` | Gate/checkpoint prompt templates. |
| `revision-loop.md` | Plan revision iteration patterns. |
| `universal-anti-patterns.md` | Universal anti-patterns to detect and avoid. |
| `artifact-types.md` | Planning artifact type definitions. |
| `phase-argument-parsing.md` | Phase argument parsing conventions. |
| `decimal-phase-calculation.md` | Decimal sub-phase numbering rules. |
| `autonomous-smart-discuss.md` | Smart-discuss logic for autonomous mode. |
| `team-mode.md` | Capability-gated team-mode spec for `/gsd-autonomous` (Decision Harvest, fresh per-step teammates, deferred UAT). |
| `teammate-prompts.md` | Agent teammate prompt templates used by team mode. |
| `brainstorm-visuals.md` | Capability-gated visual companion for `/gsd-brainstorm` (Mermaid in PRD + gated `MOCKUP.html` wireframe, convergent, degradable). |
| `ios-scaffold.md` | iOS application scaffolding patterns. |
| `executor-examples.md` | Worked examples for the gsd-executor agent. |
| `stolen-parts.md` | Local spec anchors for conventions borrowed from external frameworks (final-form router/lanes). |

### Modular Planner Decomposition

The `gsd-planner` agent is decomposed into a core agent plus reference modules to fit runtime character limits.

| Reference | Role |
|-----------|------|
| `planner-antipatterns.md` | Planner anti-patterns and specificity examples. |
| `planner-gap-closure.md` | Gap-closure mode behavior (reads VERIFICATION.md, targeted replanning). |
| `planner-revision.md` | Plan revision patterns for iterative refinement. |
| `planner-source-audit.md` | Planner source-audit and authority-limit rules. |

> **Subdirectory:** `get-shit-done/references/few-shot-examples/` contains additional few-shot examples (`plan-checker.md`, `verifier.md`) that are referenced from specific agents. These are not counted in the 49 top-level references.

---

## CLI Modules (20 shipped)

Full listing: `get-shit-done/bin/lib/*.cjs`.

| Module | Responsibility |
|--------|----------------|
| `artifacts.cjs` | Canonical artifact registry — known `.planning/` root file names; used by `gsd-health` W019 lint |
| `audit.cjs` | Audit dispatch, audit open sessions, audit storage helpers |
| `commands.cjs` | Misc CLI commands (slug, timestamp, todos, scaffolding, stats) |
| `config-schema.cjs` | Single source of truth for `VALID_CONFIG_KEYS` and dynamic key patterns; imported by both the validator and the config-schema-docs parity test |
| `config.cjs` | `config.json` read/write, section initialization; imports validator from `config-schema.cjs` |
| `core.cjs` | Error handling, output formatting, shared utilities, runtime fallbacks |
| `frontmatter.cjs` | YAML frontmatter CRUD operations |
| `init.cjs` | Compound context loading for each workflow type |
| `learnings.cjs` | Cross-phase learnings extraction for `/gsd-extract-learnings` |
| `milestone.cjs` | Milestone archival, requirements marking |
| `model-profiles.cjs` | Model profile resolution table (authoritative profile data) |
| `phase.cjs` | Phase directory operations, decimal numbering, plan indexing |
| `claude-md.cjs` | CLAUDE.md generation with managed sections (generate-claude-md) |
| `roadmap.cjs` | ROADMAP.md parsing, phase extraction, plan progress |
| `schema-detect.cjs` | Schema-drift detection for ORM patterns (Prisma, Drizzle, etc.) |
| `security.cjs` | Path traversal prevention, prompt injection detection, safe JSON/shell helpers |
| `state.cjs` | STATE.md parsing, updating, progression, metrics |
| `template.cjs` | Template selection and filling with variable substitution |
| `uat.cjs` | UAT file parsing, verification debt tracking, audit-uat support |
| `verify.cjs` | Plan structure, phase completeness, reference, commit validation |

[`docs/CLI-TOOLS.md`](CLI-TOOLS.md) may describe a subset of these modules; when it disagrees with the filesystem, this table and the directory listing are authoritative.

---

## Hooks (9 shipped)

Full listing: `hooks/`.

| Hook | Event | Purpose |
|------|-------|---------|
| `gsd-statusline.js` | `statusLine` | Displays model, directory, context usage, rate limits |
| `gsd-context-monitor.js` | `PostToolUse` / `AfterTool` | Injects agent-facing context warnings at 35%/25% remaining |
| `gsd-prompt-guard.js` | `PreToolUse` | Scans `.planning/` writes for prompt-injection patterns (advisory) |
| `gsd-workflow-guard.js` | `PreToolUse` | Detects file edits outside GSD workflow context (advisory, opt-in) |
| `gsd-read-guard.js` | `PreToolUse` | Advisory guard preventing Edit/Write on unread files |
| `gsd-read-injection-scanner.js` | `PostToolUse` | Scans tool Read results for prompt-injection patterns (v1.36+, PR #2201) |
| `gsd-session-state.sh` | `PostToolUse` | Session-state tracking for shell-based runtimes |
| `gsd-validate-commit.sh` | `PostToolUse` | Commit validation for conventional-commit enforcement |
| `gsd-phase-boundary.sh` | `PostToolUse` | Phase-boundary detection for workflow transitions |

---

## Maintenance

- When a new command, agent, workflow, reference, CLI module, or hook ships, update the corresponding section here before the release is cut.
- The drift-guard tests under `tests/` (see "How To Use This File" above) assert that every shipped file is enumerated in this inventory. A new file without a matching row here will fail CI.
- When the filesystem diverges from `docs/ARCHITECTURE.md` counts or from curated-subset docs (e.g. `docs/AGENTS.md`'s primary roster), this file is the source of truth.
