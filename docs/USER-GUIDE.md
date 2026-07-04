# GSD User Guide

A detailed reference for workflows, troubleshooting, and configuration. For quick-start setup, see the [README](../README.md).

---

## Table of Contents

- [Workflow Diagrams](#workflow-diagrams)
- [Backlog](#backlog)
- [Security](#security)
- [Command And Configuration Reference](#command-and-configuration-reference)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Recovery Quick Reference](#recovery-quick-reference)

---

## Workflow Diagrams

### Full Project Lifecycle

```
  ┌──────────────────────────────────────────────────┐
  │                   NEW PROJECT                    │
  │  /gsd-new-project                                │
  │  Questions -> Research -> Requirements -> Roadmap│
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      FOR EACH PHASE:       │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /gsd-discuss-phase │    │  <- Lock in preferences
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-plan-phase    │    │  <- Research + Plan + Verify
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-execute-phase │    │  <- Parallel execution
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-verify-work   │    │  <- Manual UAT
             │  └──────────┬─────────┘    │
             │             │              │
             │     Next Phase?────────────┘
             │             │ No
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /gsd-complete-milestone     │
            └───────────────┬──────────────┘
                            │
                   Another milestone?
                       │          │
                      Yes         No -> Done!
                       │
               ┌───────▼──────────────┐
               │  /gsd-new-milestone  │
               └──────────────────────┘
```

### Planning Agent Coordination

```
  /gsd-plan-phase N
         │
         ├── Phase Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ PLAN files │
         │                        └────────────┘
         └── Done
```

### Assumptions Discussion Mode

By default, `/gsd-discuss-phase` asks open-ended questions about your implementation preferences. Assumptions mode inverts this: GSD reads your codebase first, surfaces structured assumptions about how it would build the phase, and asks only for corrections.

**Enable:** Set `workflow.discuss_mode` to `'assumptions'` via `/gsd-settings`.

**How it works:**

1. Reads PROJECT.md, codebase mapping, and existing conventions
2. Generates a structured list of assumptions (tech choices, patterns, file locations)
3. Presents assumptions for you to confirm, correct, or expand
4. Writes CONTEXT.md from confirmed assumptions

**When to use:**

- Experienced developers who already know their codebase well
- Rapid iteration where open-ended questions slow you down
- Projects where patterns are well-established and predictable

See [docs/workflow-discuss-mode.md](workflow-discuss-mode.md) for the full discuss-mode reference.

---

## Backlog

### Backlog Parking Lot

Ideas that aren't ready for active planning go into the backlog using 999.x numbering, keeping them outside the active phase sequence.

```
/gsd-add-backlog "GraphQL API layer"     # Creates 999.1-graphql-api-layer/
/gsd-add-backlog "Mobile responsive"     # Creates 999.2-mobile-responsive/
```

Backlog items get full phase directories, so you can use `/gsd-discuss-phase 999.1` to explore an idea further or `/gsd-plan-phase 999.1` when it's ready.

**Review and promote** with `/gsd-review-backlog` — it shows all backlog items and lets you promote (move to active sequence), keep (leave in backlog), or remove (delete).

---

## Security

### Defense-in-Depth (v1.27)

GSD generates markdown files that become LLM system prompts. This means any user-controlled text flowing into planning artifacts is a potential indirect prompt injection vector. v1.27 introduced centralized security hardening:

**Path Traversal Prevention:**
All user-supplied file paths (`--text-file`, `--prd`) are validated to resolve within the project directory. macOS `/var` → `/private/var` symlink resolution is handled.

**Prompt Injection Detection:**
The `security.cjs` module scans for known injection patterns (role overrides, instruction bypasses, system tag injections) in user-supplied text before it enters planning artifacts.

**Runtime Hooks:**

- `gsd-prompt-guard.js` — Scans Write/Edit calls to `.planning/` for injection patterns (always active, advisory-only)
- `gsd-workflow-guard.js` — Warns on file edits outside GSD workflow context (opt-in)

**CI Scanner:**
`prompt-injection-scan.test.cjs` scans all agent, workflow, and command files for embedded injection vectors. Run as part of the test suite.

---

### Execution Wave Coordination

```
  /gsd-execute-phase N
         │
         ├── Analyze plan dependencies
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh 200K context) -> commit
         │     └── Executor B (fresh 200K context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh 200K context) -> commit
         │
         └── Verifier
               ├── Check codebase against phase goals
               ├── Test quality audit (disabled tests, circular patterns, assertion strength)
               │
               ├── PASS -> VERIFICATION.md (success)
               └── FAIL -> Issues logged for /gsd-verify-work
```

### Brownfield Workflow (Existing Codebase)

```
  /gsd-map-codebase
         │
         ├── Stack Mapper     -> codebase/STACK.md
         ├── Arch Mapper      -> codebase/ARCHITECTURE.md
         ├── Convention Mapper -> codebase/CONVENTIONS.md
         └── Concern Mapper   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /gsd-new-project │  <- Questions focus on what you're ADDING
        └──────────────────┘
```

---

## Code Review Workflow

### Phase Code Review

After executing a phase, run a structured code review before UAT:

```bash
/gsd-code-review 3               # Review all changed files in phase 3
/gsd-code-review 3 --depth=deep  # Deep cross-file review (import graphs, call chains)
```

The reviewer scopes files automatically using SUMMARY.md (preferred) or git diff fallback. Findings are classified as Critical, Warning, or Info in `{phase}-REVIEW.md`.

```bash
/gsd-code-review-fix 3           # Fix Critical + Warning findings atomically
/gsd-code-review-fix 3 --auto    # Fix and re-review until clean (max 3 iterations)
```

### Code Review in the Full Phase Lifecycle

The review step slots in after execution and before UAT:

```
/gsd-execute-phase N   ->  /gsd-code-review N  ->  /gsd-code-review-fix N  ->  /gsd-verify-work N
```

---

## Command And Configuration Reference

- **Command Reference:** see [`docs/COMMANDS.md`](COMMANDS.md) for every stable command's flags, subcommands, and examples. The authoritative shipped-command roster lives in [`docs/INVENTORY.md`](INVENTORY.md#commands-37-shipped).
- **Configuration Reference:** see [`docs/CONFIGURATION.md`](CONFIGURATION.md) for the full `config.json` schema, every setting's default and provenance, the per-agent model-profile table (including the `inherit` option for non-Claude runtimes), git branching strategies, and security settings.
- **Discuss Mode:** see [`docs/workflow-discuss-mode.md`](workflow-discuss-mode.md) for interview vs assumptions mode.

This guide intentionally does not re-document commands or config settings: maintaining two copies previously produced drift (`workflow.discuss_mode`'s default, `claude_md_path`'s default, the model-profile table's agent coverage). The single-source-of-truth rule is enforced mechanically by the drift-guard tests anchored on `docs/INVENTORY.md`.

<!-- The Command Reference table previously here duplicated docs/COMMANDS.md; removed to stop drift. -->
<!-- The Configuration Reference subsection (core settings, planning, workflow toggles, hooks, git branching, model profiles) previously here duplicated docs/CONFIGURATION.md; removed to stop drift. The `resolve_model_ids` ghost key that appeared only in this file's abbreviated schema is retired with the duplicate. -->

---

## Usage Examples

### New Project (Full Cycle)

```bash
claude --dangerously-skip-permissions
/gsd-new-project            # Answer questions, configure, approve roadmap
/clear
/gsd-discuss-phase 1        # Lock in your preferences
/gsd-plan-phase 1           # Research + plan + verify
/gsd-execute-phase 1        # Parallel execution
/gsd-verify-work 1          # Manual UAT
/clear
/gsd-next                   # Auto-detect and run next step
...
/gsd-complete-milestone     # Archive, tag, done
```

### New Project from Existing Document

```bash
/gsd-new-project --auto @prd.md   # Auto-runs research/requirements/roadmap from your doc
/clear
/gsd-discuss-phase 1               # Normal flow from here
```

### Existing Codebase

```bash
/gsd-map-codebase           # Analyze what exists (parallel agents)
/gsd-new-project            # Questions focus on what you're ADDING
# (normal phase workflow from here)
```

### Quick Bug Fix

```bash
/gsd-quick
> "Fix the login button not responding on mobile Safari"
```

### Resuming After a Break

```bash
/gsd-progress               # See where you left off and what's next
# or
/gsd-resume-work            # Full context restoration from last session
```

### Preparing for Release

```bash
/gsd-verify-work            # Confirm the final phase passes UAT
/gsd-complete-milestone     # Archive, tag, done
```

### Speed vs Quality Presets


| Scenario    | Mode          | Granularity | Profile    | Research | Plan Check | Verifier |
| ----------- | ------------- | ----------- | ---------- | -------- | ---------- | -------- |
| Prototyping | `yolo`        | `coarse`    | `budget`   | off      | off        | off      |
| Normal dev  | `interactive` | `standard`  | `balanced` | on       | on         | on       |
| Production  | `interactive` | `fine`      | `quality`  | on       | on         | on       |


**Skipping discuss-phase in autonomous mode:** When running in `yolo` mode with well-established preferences already captured in PROJECT.md, set `workflow.skip_discuss: true` via `/gsd-settings`. This bypasses the discuss-phase entirely and writes a minimal CONTEXT.md derived from the ROADMAP phase goal. Useful when your PROJECT.md and conventions are comprehensive enough that discussion adds no new information.

### Mid-Milestone Scope Changes

```bash
/gsd-add-phase              # Append a new phase to the roadmap
# or
/gsd-insert-phase 3         # Insert urgent work between phases 3 and 4
# or
/gsd-remove-phase 7         # Descope phase 7 and renumber
```

---

## Troubleshooting

### Programmatic CLI (`gsd-remix-sdk query` vs `gsd-tools.cjs`)

For automation and copy-paste from docs, prefer **`gsd-remix-sdk query`** with a registered subcommand (see [CLI-TOOLS.md — SDK and programmatic access](CLI-TOOLS.md#sdk-and-programmatic-access) and [QUERY-HANDLERS.md](../sdk/src/query/QUERY-HANDLERS.md)). The legacy `node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs` CLI remains supported for dual-mode operation.

**Two different `state` JSON shapes in the legacy CLI:** `state json` (frontmatter rebuild) vs `state load` (`config` + `state_raw` + flags). **`gsd-remix-sdk query` today:** both `state.json` and `state.load` resolve to the frontmatter-rebuild handler — use `node …/gsd-tools.cjs state load` when you need the CJS `state load` shape. See [CLI-TOOLS.md](CLI-TOOLS.md#sdk-and-programmatic-access) and QUERY-HANDLERS.

### STATE.md Out of Sync

If STATE.md shows incorrect phase status or position, use the state consistency commands (**CJS-only** until ported to the query layer):

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state validate          # Detect drift between STATE.md and filesystem
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state sync --verify     # Preview what sync would change
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state sync              # Reconstruct STATE.md from disk
```

These commands are new in v1.32 and replace manual STATE.md editing.

### Read-Before-Edit Infinite Retry Loop

Some non-Claude runtimes (Cline, Augment Code) may enter an infinite retry loop when an agent attempts to edit a file it hasn't read. The `gsd-read-before-edit.js` hook (v1.32) detects this pattern and advises reading the file first. If your runtime doesn't support PreToolUse hooks, add this to your project's `CLAUDE.md`:

```markdown
## Edit Safety Rule
Always read a file before editing it. Never call Edit or Write on a file you haven't read in this session.
```

### "Project already initialized"

You ran `/gsd-new-project` but `.planning/PROJECT.md` already exists. This is a safety check. If you want to start over, delete the `.planning/` directory first.

### Context Degradation During Long Sessions

Clear your context window between major commands: `/clear` in Claude Code. GSD is designed around fresh contexts -- every subagent gets a clean 200K window. If quality is dropping in the main session, clear and use `/gsd-resume-work` or `/gsd-progress` to restore state.

### Plans Seem Wrong or Misaligned

Run `/gsd-discuss-phase [N]` before planning. Most plan quality issues come from Claude making assumptions that `CONTEXT.md` would have prevented. You can also run `/gsd-discuss-phase [N]` in assumptions mode (`workflow.discuss_mode: assumptions`) to have Claude surface what it intends to do before committing to a plan.

### Execution Fails or Produces Stubs

Check that the plan was not too ambitious. Plans should have 2-3 tasks maximum. If tasks are too large, they exceed what a single context window can produce reliably. Re-plan with smaller scope.

### Lost Track of Where You Are

Run `/gsd-progress`. It reads all state files and tells you exactly where you are and what to do next.

### Need to Change Something After Execution

Do not re-run `/gsd-execute-phase`. Use `/gsd-quick` for targeted fixes, or `/gsd-verify-work` to systematically identify and fix issues through UAT.

### Model Costs Too High

Disable research and plan-check agents via `/gsd-settings` if the domain is familiar to you (or to Claude).

### Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI, Kilo)

If you installed GSD for a non-Claude runtime, the installer already configured model resolution so all agents use the runtime's default model. No manual setup is needed. Specifically, the installer sets `resolve_model_ids: "omit"` in your config, which tells GSD to skip Anthropic model ID resolution and let the runtime choose its own default model.

To assign different models to different agents on a non-Claude runtime, add `model_overrides` to `.planning/config.json` with fully-qualified model IDs that your runtime recognizes:

```json
{
  "resolve_model_ids": "omit",
  "model_overrides": {
    "gsd-planner": "o3",
    "gsd-executor": "o4-mini",
    "gsd-debugger": "o3"
  }
}
```

The installer auto-configures `resolve_model_ids: "omit"` for Gemini CLI, OpenCode, Kilo, and Codex. If you're manually setting up a non-Claude runtime, add it to `.planning/config.json` yourself.

See the [Configuration Reference](CONFIGURATION.md#non-claude-runtimes-codex-opencode-gemini-cli-kilo) for the full explanation.

### Installing for Cline

Cline uses a rules-based integration — GSD installs as `.clinerules` rather than slash commands.

```bash
# Global install (applies to all projects)
npx get-shit-done-cc --cline --global

# Local install (this project only)
npx get-shit-done-cc --cline --local
```

Global installs write to `~/.cline/`. Local installs write to `./.cline/`. No custom slash commands are registered — GSD rules are loaded automatically by Cline from the rules file.

### Installing for CodeBuddy

CodeBuddy uses a skills-based integration.

```bash
npx get-shit-done-cc --codebuddy --global
```

Skills are installed to `~/.codebuddy/skills/gsd-*/SKILL.md`.

### Installing for Qwen Code

Qwen Code uses the same open skills standard as Claude Code 2.1.88+.

```bash
npx get-shit-done-cc --qwen --global
```

Skills are installed to `~/.qwen/skills/gsd-*/SKILL.md`. Use the `QWEN_CONFIG_DIR` environment variable to override the default install path.

### Using Claude Code with Non-Anthropic Providers (OpenRouter, Local)

If GSD subagents call Anthropic models and you're paying through OpenRouter or a local provider, switch to the `inherit` profile via `/gsd-settings` → Model Profile → Inherit. This makes all agents use your current session model instead of specific Anthropic models.

### Working on a Sensitive/Private Project

Set `commit_docs: false` during `/gsd-new-project` or via `/gsd-settings`. Add `.planning/` to your `.gitignore`. Planning artifacts stay local and never touch git.

### GSD Update Overwrote My Local Changes

Since v1.17, the installer backs up locally modified files to `gsd-local-patches/`. After reinstalling, manually compare and merge your changes back from that directory.

### Cannot Update via npm

If `npx get-shit-done-cc` fails due to npm outages or network restrictions, see [docs/manual-update.md](manual-update.md) for a step-by-step manual update procedure that works without npm access.

### Executor Subagent Gets "Permission denied" on Bash Commands

GSD's `gsd-executor` subagents need write-capable Bash access to a project's standard tooling — `git commit`, `bin/rails`, `bundle exec`, `npm run`, `uv run`, and similar commands. Claude Code's default `~/.claude/settings.json` only allows a narrow set of read-only git commands, so a fresh install will hit "Permission to use Bash has been denied" the first time an executor tries to make a commit or run a build tool.

**Fix: add the required patterns to `~/.claude/settings.json`.**

The patterns you need depend on your stack. Copy the block for your stack and add it to the `permissions.allow` array.

#### Required for all stacks (git + gh)

```json
"Bash(git add:*)",
"Bash(git commit:*)",
"Bash(git merge:*)",
"Bash(git worktree:*)",
"Bash(git rebase:*)",
"Bash(git reset:*)",
"Bash(git checkout:*)",
"Bash(git switch:*)",
"Bash(git restore:*)",
"Bash(git stash:*)",
"Bash(git rm:*)",
"Bash(git mv:*)",
"Bash(git fetch:*)",
"Bash(git cherry-pick:*)",
"Bash(git apply:*)",
"Bash(gh:*)"
```

#### Rails / Ruby

```json
"Bash(bin/rails:*)",
"Bash(bin/brakeman:*)",
"Bash(bin/bundler-audit:*)",
"Bash(bin/importmap:*)",
"Bash(bundle:*)",
"Bash(rubocop:*)",
"Bash(erb_lint:*)"
```

#### Python / uv

```json
"Bash(uv:*)",
"Bash(python:*)",
"Bash(pytest:*)",
"Bash(ruff:*)",
"Bash(mypy:*)"
```

#### Node / npm / pnpm / bun

```json
"Bash(npm:*)",
"Bash(npx:*)",
"Bash(pnpm:*)",
"Bash(bun:*)",
"Bash(node:*)"
```

#### Rust / Cargo

```json
"Bash(cargo:*)"
```

**Example `~/.claude/settings.json` snippet (Rails project):**

```json
{
  "permissions": {
    "allow": [
      "Write",
      "Edit",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git merge:*)",
      "Bash(git worktree:*)",
      "Bash(git rebase:*)",
      "Bash(git reset:*)",
      "Bash(git checkout:*)",
      "Bash(git switch:*)",
      "Bash(git restore:*)",
      "Bash(git stash:*)",
      "Bash(git rm:*)",
      "Bash(git mv:*)",
      "Bash(git fetch:*)",
      "Bash(git cherry-pick:*)",
      "Bash(git apply:*)",
      "Bash(gh:*)",
      "Bash(bin/rails:*)",
      "Bash(bin/brakeman:*)",
      "Bash(bin/bundler-audit:*)",
      "Bash(bundle:*)",
      "Bash(rubocop:*)"
    ]
  }
}
```

**Per-project permissions (scoped to one repo):** If you prefer to allow these patterns for a single project rather than globally, add the same `permissions.allow` block to `.claude/settings.local.json` in your project root instead of `~/.claude/settings.json`. Claude Code checks project-local settings first.

**Interactive guidance:** When an executor is blocked mid-phase, it will identify the exact pattern needed (e.g. `"Bash(bin/rails:*)"`) so you can add it and re-run `/gsd-execute-phase`.

### Subagent Appears to Fail but Work Was Done

A known workaround exists for a Claude Code classification bug. GSD's orchestrators (execute-phase, quick) spot-check actual output before reporting failure. If you see a failure message but commits were made, check `git log` -- the work may have succeeded.

### Parallel Execution Causes Build Lock Errors

If you see pre-commit hook failures, cargo lock contention, or 30+ minute execution times during parallel wave execution, this is caused by multiple agents triggering build tools simultaneously. GSD handles this automatically since v1.26 — parallel agents use `--no-verify` on commits and the orchestrator runs hooks once after each wave. If you're on an older version, add this to your project's `CLAUDE.md`:

```markdown
## Git Commit Rules for Agents
All subagent/executor commits MUST use `--no-verify`.
```

To disable parallel execution entirely: `/gsd-settings` → set `parallelization.enabled` to `false`.

### Windows: Installation Crashes on Protected Directories

If the installer crashes with `EPERM: operation not permitted, scandir` on Windows, this is caused by OS-protected directories (e.g., Chromium browser profiles). Fixed since v1.24 — update to the latest version. As a workaround, temporarily rename the problematic directory before running the installer.

---

## Recovery Quick Reference


| Problem                              | Solution                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Lost context / new session           | `/gsd-resume-work` or `/gsd-progress`                                    |
| Phase went wrong                     | `git revert` the phase commits, then re-plan                             |
| Need to change scope                 | `/gsd-add-phase`, `/gsd-insert-phase`, or `/gsd-remove-phase`            |
| Something broke                      | `/gsd-debug "description"` (add `--diagnose` for analysis without fixes) |
| STATE.md out of sync                 | `state validate` then `state sync`                                       |
| Quick targeted fix                   | `/gsd-quick`                                                             |
| Plan doesn't match your vision       | `/gsd-discuss-phase [N]` then re-plan                                    |
| Costs running high                   | `/gsd-settings` to toggle agents off                                     |
| Update broke local changes           | Merge manually from `gsd-local-patches/`                                 |
| Don't know what step is next         | `/gsd-next`                                                              |
| Parallel execution build errors      | Update GSD or set `parallelization.enabled: false`                       |


---

## Project File Structure

For reference, here is what GSD creates in your project:

```
.planning/
  PROJECT.md              # Project vision and context (always loaded)
  REQUIREMENTS.md         # Scoped v1/v2 requirements with IDs
  ROADMAP.md              # Phase breakdown with status tracking
  STATE.md                # Decisions, blockers, session memory
  config.json             # Workflow configuration
  MILESTONES.md           # Completed milestone archive
  HANDOFF.json            # Structured session handoff (from /gsd-pause-work)
  research/               # Domain research from /gsd-new-project
  todos/
    pending/              # Captured ideas awaiting work
    done/                 # Completed todos
  debug/                  # Active debug sessions
    resolved/             # Archived debug sessions
  codebase/               # Brownfield codebase mapping (from /gsd-map-codebase)
  phases/
    XX-phase-name/
      XX-YY-PLAN.md       # Atomic execution plans
      XX-YY-SUMMARY.md    # Execution outcomes and decisions
      CONTEXT.md          # Your implementation preferences
      RESEARCH.md         # Ecosystem research findings
      VERIFICATION.md     # Post-execution verification results
```

