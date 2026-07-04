# GSD Command Reference

> Command syntax, flags, options, and examples for stable commands. For feature details, see [Feature Reference](FEATURES.md). For workflow walkthroughs, see [User Guide](USER-GUIDE.md).

---

## Command Syntax

- **Claude Code / Gemini / Copilot:** `/gsd-command-name [args]`
- **OpenCode / Kilo:** `/gsd-command-name [args]`
- **Codex:** `$gsd-command-name [args]`

---

## Core Workflow Commands

### `/gsd-new-project`

Initialize a new project with deep context gathering.

| Flag | Description |
|------|-------------|
| `--auto @file.md` | Auto-extract from document, skip interactive questions |

**Prerequisites:** No existing `.planning/PROJECT.md`
**Produces:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `research/`, `CLAUDE.md`

```bash
/gsd-new-project                    # Interactive mode
/gsd-new-project --auto @prd.md     # Auto-extract from PRD
```

---

### `/gsd-discuss-phase`

Capture implementation decisions before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

| Flag | Description |
|------|-------------|
| `--all` | Skip area selection — discuss all gray areas interactively (no auto-advance) |
| `--auto` | Auto-select recommended defaults for all questions |
| `--batch` | Group questions for batch intake instead of one-by-one |
| `--analyze` | Add trade-off analysis during discussion |
| `--power` | File-based bulk question answering from a prepared answers file |
| `--no-advisor` | Disable advisor mode (research-backed recommendations are on by default) |

**Prerequisites:** `.planning/ROADMAP.md` exists
**Produces:** `{phase}-CONTEXT.md`, `{phase}-DISCUSSION-LOG.md` (audit trail)

```bash
/gsd-discuss-phase 1                # Interactive discussion for phase 1
/gsd-discuss-phase 1 --all          # Discuss all gray areas without selection step
/gsd-discuss-phase 3 --auto         # Auto-select defaults for phase 3
/gsd-discuss-phase --batch          # Batch mode for current phase
/gsd-discuss-phase 2 --analyze      # Discussion with trade-off analysis
/gsd-discuss-phase 1 --power        # Bulk answers from file
```

---

### `/gsd-plan-phase`

Research, plan, and verify a phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to next unplanned phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Skip interactive confirmations |
| `--research` | Force re-research even if RESEARCH.md exists |
| `--skip-research` | Skip domain research step |
| `--gaps` | Gap closure mode (reads VERIFICATION.md, skips research) |
| `--skip-verify` | Skip plan checker verification loop |
| `--prd <file>` | Use a PRD file instead of discuss-phase for context |
| `--validate` | Run state validation before planning begins |

**Prerequisites:** `.planning/ROADMAP.md` exists
**Produces:** `{phase}-RESEARCH.md`, `{phase}-{N}-PLAN.md`

```bash
/gsd-plan-phase 1                   # Research + plan + verify phase 1
/gsd-plan-phase 3 --skip-research   # Plan without research (familiar domain)
/gsd-plan-phase --auto              # Non-interactive planning
/gsd-plan-phase 2 --validate        # Validate state before planning
```

---

### `/gsd-execute-phase`

Execute all plans in a phase with wave-based parallelization, or run a specific wave.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number to execute |
| `--wave N` | No | Execute only Wave `N` in the phase |
| `--validate` | No | Run state validation before execution begins |

**Prerequisites:** Phase has PLAN.md files
**Produces:** per-plan `{phase}-{N}-SUMMARY.md`, git commits, and `{phase}-VERIFICATION.md` when the phase is fully complete

```bash
/gsd-execute-phase 1                # Execute phase 1
/gsd-execute-phase 1 --wave 2       # Execute only Wave 2
/gsd-execute-phase 1 --validate     # Validate state before execution
```

---

### `/gsd-verify-work`

User acceptance testing with auto-diagnosis.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Phase has been executed
**Produces:** `{phase}-UAT.md`, fix plans if issues found

```bash
/gsd-verify-work 1                  # UAT for phase 1
```

---

### `/gsd-next`

Automatically advance to the next logical workflow step. Reads project state and runs the appropriate command.

**Prerequisites:** `.planning/` directory exists
**Behavior:**
- No project → suggests `/gsd-new-project`
- Phase needs discussion → runs `/gsd-discuss-phase`
- Phase needs planning → runs `/gsd-plan-phase`
- Phase needs execution → runs `/gsd-execute-phase`
- Phase needs verification → runs `/gsd-verify-work`
- All phases complete → suggests `/gsd-complete-milestone`

```bash
/gsd-next                           # Auto-detect and run next step
```

---

### `/gsd-complete-milestone`

Archive milestone, tag release.

**Prerequisites:** All phases executed and verified
**Produces:** `MILESTONES.md` entry, git tag

```bash
/gsd-complete-milestone
```

---

### `/gsd-new-milestone`

Start next version cycle.

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Milestone name |
| `--reset-phase-numbers` | No | Restart the new milestone at Phase 1 and archive old phase dirs before roadmapping |

**Prerequisites:** Previous milestone completed
**Produces:** Updated `PROJECT.md`, new `REQUIREMENTS.md`, new `ROADMAP.md`

```bash
/gsd-new-milestone                  # Interactive
/gsd-new-milestone "v2.0 Mobile"    # Named milestone
/gsd-new-milestone --reset-phase-numbers "v2.0 Mobile"  # Restart milestone numbering at 1
```

---

## Phase Management Commands

### `/gsd-add-phase`

Append new phase to roadmap.

```bash
/gsd-add-phase                      # Interactive — describe the phase
```

### `/gsd-insert-phase`

Insert urgent work between phases using decimal numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Insert after this phase number |

```bash
/gsd-insert-phase 3                 # Insert between phase 3 and 4 → creates 3.1
```

### `/gsd-remove-phase`

Remove future phase and renumber subsequent phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number to remove |

```bash
/gsd-remove-phase 7                 # Remove phase 7, renumber 8→7, 9→8, etc.
```

### `/gsd-research-phase`

Deep ecosystem research only (standalone — usually use `/gsd-plan-phase` instead).

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd-research-phase 4               # Research phase 4 domain
```

---

## Navigation Commands

### `/gsd-progress`

Show status and next steps.

| Flag | Description |
|------|-------------|
| `--forensic` | Append a 6-check integrity audit after the standard report (STATE consistency, orphaned handoffs, deferred scope drift, memory-flagged pending work, blocking todos, uncommitted code) |

```bash
/gsd-progress                       # "Where am I? What's next?"
/gsd-progress --forensic            # Standard report + integrity audit
```

### `/gsd-resume-work`

Restore full context from last session.

```bash
/gsd-resume-work                    # After context reset or new session
```

### `/gsd-pause-work`

Save context handoff when stopping mid-phase.

```bash
/gsd-pause-work                     # Creates continue-here.md
```

### `/gsd-help`

Show all commands and usage guide.

```bash
/gsd-help                           # Quick reference
```

---

## Utility Commands

### `/gsd-undo`

Safe git revert — roll back GSD phase or plan commits using the phase manifest with dependency checks and a confirmation gate.

| Flag | Required | Description |
|------|----------|-------------|
| `--last N` | (one of three required) | Show recent GSD commits for interactive selection |
| `--phase NN` | (one of three required) | Revert all commits for a phase |
| `--plan NN-MM` | (one of three required) | Revert all commits for a specific plan |

**Safety:** Checks dependent phases/plans before reverting; always shows a confirmation gate.

```bash
/gsd-undo --last 5                  # Pick from the 5 most recent GSD commits
/gsd-undo --phase 03                # Revert all commits for phase 3
/gsd-undo --plan 03-02              # Revert commits for plan 02 of phase 3
```

---

### `/gsd-quick`

Execute ad-hoc task with GSD guarantees.

| Flag | Description |
|------|-------------|
| `--full` | Enable the complete quality pipeline — discussion + research + plan-checking + verification |
| `--validate` | Plan-checking (max 2 iterations) + post-execution verification only; no discussion or research |
| `--discuss` | Lightweight pre-planning discussion |
| `--research` | Spawn focused researcher before planning |

Granular flags are composable: `--discuss --research --validate` is equivalent to `--full`.

| Subcommand | Description |
|------------|-------------|
| `list` | List all quick tasks with status |
| `status <slug>` | Show status of a specific quick task |
| `resume <slug>` | Resume a specific quick task by slug |

```bash
/gsd-quick                          # Basic quick task
/gsd-quick --discuss --research     # Discussion + research + planning
/gsd-quick --validate               # Plan-checking + verification only
/gsd-quick --full                   # Complete quality pipeline
/gsd-quick list                     # List all quick tasks
/gsd-quick status my-task-slug      # Show status of a quick task
/gsd-quick resume my-task-slug      # Resume a quick task
```

### `/gsd-autonomous`

Run all remaining phases autonomously.

| Flag | Description |
|------|-------------|
| `--from N` | Start from a specific phase number |
| `--to N` | Stop after completing a specific phase number |
| `--interactive` | Lean context with user input |

```bash
/gsd-autonomous                     # Run all remaining phases
/gsd-autonomous --from 3            # Start from phase 3
/gsd-autonomous --to 5              # Run up to and including phase 5
/gsd-autonomous --from 3 --to 5     # Run phases 3 through 5
```

### `/gsd-do`

Route freeform text to the right GSD command.

```bash
/gsd-do                             # Then describe what you want
```

### `/gsd-note`

Zero-friction idea capture — append, list, or promote notes to todos.

| Argument | Required | Description |
|----------|----------|-------------|
| `text` | No | Note text to capture (default: append mode) |
| `list` | No | List all notes from project and global scopes |
| `promote N` | No | Convert note N into a structured todo |

| Flag | Description |
|------|-------------|
| `--global` | Use global scope for note operations |

```bash
/gsd-note "Consider caching strategy for API responses"
/gsd-note list
/gsd-note promote 3
```

### `/gsd-debug`

Systematic debugging with persistent state.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Description of the bug |

| Flag | Description |
|------|-------------|
| `--diagnose` | Diagnosis-only mode — investigate without attempting fixes |

**Subcommands:**
- `/gsd-debug list` — List all active debug sessions with status, hypothesis, and next action
- `/gsd-debug status <slug>` — Print full summary of a session (Evidence count, Eliminated count, Resolution, TDD checkpoint) without spawning an agent
- `/gsd-debug continue <slug>` — Resume a specific session by slug (surfaces Current Focus then spawns continuation agent)
- `/gsd-debug [--diagnose] <description>` — Start new debug session (existing behavior; `--diagnose` stops at root cause without applying fix)

**TDD mode:** When `tdd_mode: true` in `.planning/config.json`, debug sessions require a failing test to be written and verified before any fix is applied (red → green → done).

```bash
/gsd-debug "Login button not responding on mobile Safari"
/gsd-debug --diagnose "Intermittent 500 errors on /api/users"
/gsd-debug list
/gsd-debug status auth-token-null
/gsd-debug continue form-submit-500
```

### `/gsd-add-todo`

Capture idea or task for later.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Todo description |

```bash
/gsd-add-todo "Consider adding dark mode support"
```

### `/gsd-check-todos`

List pending todos and select one to work on.

```bash
/gsd-check-todos
```

### `/gsd-add-tests`

Generate tests for a completed phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd-add-tests 2                    # Generate tests for phase 2
```

### `/gsd-health`

Validate `.planning/` directory integrity or check runtime/install health. Runtime mode also prints the installed distribution identity so shared `/gsd-*` commands can be confirmed as `gsd-remix` instead of stale upstream GSD assets.

| Flag | Description |
|------|-------------|
| `--runtime` | Run runtime/install diagnostics (Node version + legacy bridge health) |
| `--repair` | Auto-fix recoverable planning issues, or rebuild the bundled SDK when combined with `--runtime` |
| `--backfill` | Backfill milestone snapshots into `MILESTONES.md` during planning health repair |

```bash
/gsd-health                         # Check integrity
/gsd-health --repair                # Check and fix
/gsd-health --runtime               # Check runtime/install health and remix identity
/gsd-health --runtime --repair      # Rebuild gsd-remix-sdk from bundled source
```

### `/gsd-cleanup`

Archive accumulated phase directories from completed milestones.

```bash
/gsd-cleanup
```

---

## Configuration Commands

### `/gsd-settings`

Interactive configuration of workflow toggles and model profile.

```bash
/gsd-settings                       # Interactive config
```

---

## Brownfield Commands

### `/gsd-map-codebase`

Analyze existing codebase with parallel mapper agents.

| Argument | Required | Description |
|----------|----------|-------------|
| `area` | No | Scope mapping to a specific area |

```bash
/gsd-map-codebase                   # Full codebase analysis
/gsd-map-codebase auth              # Focus on auth area
```

---

## Code Quality Commands

### `/gsd-code-review`

Review source files changed during a phase for bugs, security vulnerabilities, and code quality problems.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number whose changes to review (e.g., `2` or `02`) |
| `--depth=quick\|standard\|deep` | No | Review depth level (overrides `workflow.code_review_depth` config). `quick`: pattern-matching only (~2 min). `standard`: per-file analysis with language-specific checks (~5–15 min, default). `deep`: cross-file analysis including import graphs and call chains (~15–30 min) |
| `--files file1,file2,...` | No | Explicit comma-separated file list; skips SUMMARY/git scoping entirely |

**Prerequisites:** Phase has been executed and has SUMMARY.md or git history
**Produces:** `{phase}-REVIEW.md` in phase directory with severity-classified findings
**Spawns:** `gsd-code-reviewer` agent

```bash
/gsd-code-review 3                          # Standard review for phase 3
/gsd-code-review 2 --depth=deep             # Deep cross-file review
/gsd-code-review 4 --files src/auth.ts,src/token.ts  # Explicit file list
```

---

### `/gsd-code-review-fix`

Auto-fix issues found by `/gsd-code-review`. Reads `REVIEW.md`, spawns a fixer agent, commits each fix atomically, and produces a `REVIEW-FIX.md` summary.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number whose REVIEW.md to fix |
| `--all` | No | Include Info findings in fix scope (default: Critical + Warning only) |
| `--auto` | No | Enable fix + re-review iteration loop, capped at 3 iterations |

**Prerequisites:** Phase has a `{phase}-REVIEW.md` file (run `/gsd-code-review` first)
**Produces:** `{phase}-REVIEW-FIX.md` with applied fixes summary
**Spawns:** `gsd-code-fixer` agent

```bash
/gsd-code-review-fix 3                      # Fix Critical + Warning findings for phase 3
/gsd-code-review-fix 3 --all               # Include Info findings
/gsd-code-review-fix 3 --auto              # Fix and re-review until clean (max 3 iterations)
```

---

## Fast & Inline Commands

### `/gsd-fast`

Execute a trivial task inline — no subagents, no planning overhead. For typo fixes, config changes, small refactors, forgotten commits.

| Argument | Required | Description |
|----------|----------|-------------|
| `task description` | No | What to do (prompted if omitted) |

**Not a replacement for `/gsd-quick`** — use `/gsd-quick` for anything needing research, multi-step planning, or verification.

```bash
/gsd-fast "fix typo in README"
/gsd-fast "add .env to gitignore"
```

---

### `/gsd-pr-branch`

Create a clean PR branch by filtering out `.planning/` commits.

| Argument | Required | Description |
|----------|----------|-------------|
| `target branch` | No | Base branch (default: `main`) |

**Purpose:** Reviewers see only code changes, not GSD planning artifacts.

```bash
/gsd-pr-branch                     # Filter against main
/gsd-pr-branch develop             # Filter against develop
```

---

## Backlog Commands

### `/gsd-add-backlog`

Add an idea to the backlog parking lot using 999.x numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | **Yes** | Backlog item description |

**999.x numbering** keeps backlog items outside the active phase sequence. Phase directories are created immediately so `/gsd-discuss-phase` and `/gsd-plan-phase` work on them.

```bash
/gsd-add-backlog "GraphQL API layer"
/gsd-add-backlog "Mobile responsive redesign"
```

---

### `/gsd-review-backlog`

Review and promote backlog items to active milestone.

**Actions per item:** Promote (move to active sequence), Keep (leave in backlog), Remove (delete).

```bash
/gsd-review-backlog
```

---

## State Management Commands

### `state validate`

Detect drift between STATE.md and the actual filesystem.

**Prerequisites:** `.planning/STATE.md` exists
**Produces:** Validation report showing any drift between STATE.md fields and filesystem reality

```bash
node gsd-tools.cjs state validate
```

---

### `state sync [--verify]`

Reconstruct STATE.md from actual project state on disk.

| Flag | Description |
|------|-------------|
| `--verify` | Dry-run mode — show proposed changes without writing |

**Prerequisites:** `.planning/` directory exists
**Produces:** Updated `STATE.md` reflecting filesystem reality

```bash
node gsd-tools.cjs state sync             # Reconstruct STATE.md from disk
node gsd-tools.cjs state sync --verify    # Dry-run: show changes without writing
```

---

### `state planned-phase`

Record state transition after plan-phase completes (Planned/Ready to execute).

| Flag | Description |
|------|-------------|
| `--phase N` | Phase number that was planned |
| `--plans N` | Number of plans generated |

**Prerequisites:** Phase has been planned
**Produces:** Updated `STATE.md` with post-planning state

```bash
node gsd-tools.cjs state planned-phase --phase 3 --plans 2
```

---

## Community Commands

### Community Hooks

Optional git and session hooks gated behind `hooks.community: true` in `.planning/config.json`. All are no-ops unless explicitly enabled.

| Hook | Purpose |
|------|---------|
| `gsd-validate-commit.sh` | Enforce Conventional Commits format on git commit messages |
| `gsd-session-state.sh` | Track session state transitions |
| `gsd-phase-boundary.sh` | Enforce phase boundary checks |

Enable with:
```json
{ "hooks": { "community": true } }
```
