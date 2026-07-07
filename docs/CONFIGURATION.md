# GSD Configuration Reference

> Full configuration schema, workflow toggles, model profiles, and git branching options. For feature context, see [Feature Reference](FEATURES.md).

---

## Configuration File

GSD stores project settings in `.planning/config.json`. Created during `/gsd-new-project`, updated via `/gsd-settings`.

### Full Schema

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "model_profile": "balanced",
  "model_overrides": {},
  "planning": {
    "commit_docs": true,
    "search_gitignored": false,
    "sub_repos": []
  },
  "context": null,
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": false,
    "nyquist_validation": false,
    "node_repair": true,
    "node_repair_budget": 2,
    "research_before_questions": false,
    "discuss_mode": "discuss",
    "skip_discuss": false,
    "tdd_mode": false,
    "text_mode": false,
    "use_worktrees": true,
    "code_review": true,
    "code_review_depth": "standard",
    "security_enforcement": false,
    "security_review": "auto"
  },
  "hooks": {
    "context_warnings": true
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },
  "git": {
    "branching_strategy": "none",
    "phase_branch_template": "gsd/phase-{phase}-{slug}",
    "milestone_branch_template": "gsd/{milestone}-{slug}",
    "quick_branch_template": null
  },
  "gates": {
    "confirm_project": true,
    "confirm_phases": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_plan": true,
    "execute_next_plan": true,
    "issues_review": true,
    "confirm_transition": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  },
  "project_code": null,
  "agent_skills": {},
  "response_language": null,
  "features": {
    "global_learnings": false
  },
  "learnings": {
    "max_inject": 10
  },
  "intel": {
    "enabled": false
  },
  "claude_md_path": "./CLAUDE.md"
}
```

---

## Core Settings

| Setting | Type | Options | Default | Description |
|---------|------|---------|---------|-------------|
| `mode` | enum | `interactive`, `yolo` | `interactive` | `yolo` auto-approves decisions; `interactive` confirms at each step |
| `granularity` | enum | `coarse`, `standard`, `fine` | `standard` | Controls phase count: `coarse` (3-5), `standard` (5-8), `fine` (8-12) |
| `model_profile` | enum | `quality`, `balanced`, `budget`, `inherit` | `balanced` | Model tier for each agent (see [Model Profiles](#model-profiles)) |
| `project_code` | string | any short string | (none) | Prefix for phase directory names (e.g., `"ABC"` produces `ABC-01-setup/`). Added in v1.31 |
| `response_language` | string | language code | (none) | Language for agent responses (e.g., `"pt"`, `"ko"`, `"ja"`). Propagates to all spawned agents for cross-phase language consistency. Added in v1.32 |
| `context_profile` | string | `dev`, `research`, `review` | (none) | Execution context preset that applies a pre-configured bundle of mode, model, and workflow settings for the current type of work. Added in v1.34 |
| `claude_md_path` | string | any file path | `./CLAUDE.md` | Custom output path for the generated CLAUDE.md file. Useful for monorepos or projects that need CLAUDE.md in a non-root location. Defaults to `./CLAUDE.md` at the project root. Added in v1.36 |
| `claude_md_assembly.mode` | enum | `embed`, `link` | `embed` | Controls how managed sections are written into CLAUDE.md. `embed` (default) inlines content between GSD markers. `link` writes `@.planning/<source-path>` instead — Claude Code expands the reference at runtime, reducing CLAUDE.md size by ~65% on typical projects. `link` only applies to sections that have a real source file; `workflow` and fallback sections always embed. Per-block overrides: `claude_md_assembly.blocks.<section>` (e.g. `claude_md_assembly.blocks.architecture: link`). Added in v1.38 |
| `context` | string | any text | (none) | Custom context string injected into every agent prompt for the project. Use to provide persistent project-specific guidance (e.g., coding conventions, team practices) that every agent should be aware of |
| `phase_naming` | string | any string | (none) | Custom prefix for phase directory names. When set, overrides the auto-generated phase slug (e.g., `"feature"` produces `feature-01-setup/` instead of the roadmap-derived slug) |
| `brave_search` | boolean | `true`/`false` | auto-detected | Override auto-detection of Brave Search API availability. When unset, GSD checks for `BRAVE_API_KEY` env var or `~/.gsd/brave_api_key` file |
| `firecrawl` | boolean | `true`/`false` | auto-detected | Override auto-detection of Firecrawl API availability. When unset, GSD checks for `FIRECRAWL_API_KEY` env var or `~/.gsd/firecrawl_api_key` file |
| `exa_search` | boolean | `true`/`false` | auto-detected | Override auto-detection of Exa Search API availability. When unset, GSD checks for `EXA_API_KEY` env var or `~/.gsd/exa_api_key` file |
| `search_gitignored` | boolean | `true`/`false` | `false` | Legacy top-level alias for `planning.search_gitignored`. Prefer the namespaced form; this alias is accepted for backward compatibility |

> **Note:** `granularity` was renamed from `depth` in v1.22.3. Existing configs are auto-migrated.

---

## Workflow Toggles

All workflow toggles follow the **absent = enabled** pattern. If a key is missing from config, it defaults to `true`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `workflow.research` | boolean | `true` | Domain investigation before planning each phase |
| `workflow.plan_check` | boolean | `true` | Plan verification loop (up to 3 iterations) |
| `workflow.verifier` | boolean | `true` | Post-execution verification against phase goals |
| `workflow.auto_advance` | boolean | `false` | Auto-chain discuss → plan → execute without stopping |
| `workflow.nyquist_validation` | boolean | `false` | Legacy validation-gate switch. The feature was removed; keep the key explicitly `false` — absent is treated as enabled by some readers |
| `workflow.node_repair` | boolean | `true` | Autonomous task repair on verification failure |
| `workflow.node_repair_budget` | number | `2` | Max repair attempts per failed task |
| `workflow.research_before_questions` | boolean | `false` | Run research before discussion questions instead of after |
| `workflow.discuss_mode` | string | `'discuss'` | Controls how `/gsd-discuss-phase` gathers context. `'discuss'` (default) asks questions one-by-one. `'assumptions'` reads the codebase first, generates structured assumptions with confidence levels, and only asks you to correct what's wrong. Added in v1.28 |
| `workflow.skip_discuss` | boolean | `false` | When `true`, `/gsd-autonomous` bypasses the discuss-phase entirely, writing minimal CONTEXT.md from the ROADMAP phase goal. Useful for projects where developer preferences are fully captured in PROJECT.md/REQUIREMENTS.md. Added in v1.28 |
| `workflow.text_mode` | boolean | `false` | Replaces AskUserQuestion TUI menus with plain-text numbered lists. Required for Claude Code remote sessions (`/rc` mode) where TUI menus don't render. Can also be set per-session with `--text` flag on discuss-phase. Added in v1.28 |
| `workflow.use_worktrees` | boolean | `true` | When `false`, disables git worktree isolation for parallel execution. Users who prefer sequential execution or whose environment does not support worktrees can disable this. Added in v1.31 |
| `workflow.code_review` | boolean | `true` | Enable `/gsd-code-review` and `/gsd-code-review-fix` commands. When `false`, the commands exit with a configuration gate message. Added in v1.34 |
| `workflow.code_review_depth` | string | `standard` | Default review depth for `/gsd-code-review`: `quick` (pattern-matching only), `standard` (per-file analysis), or `deep` (cross-file with import graphs). Can be overridden per-run with `--depth=`. Added in v1.34 |
| `workflow.quick_plan_gate` | string | `auto` | Human plan→execute gate for `/gsd-quick` (MEDIUM lane): `auto` (proceed, no stop — default), `ask` (pause and confirm the plan before executing), or `off` (proceed). `--auto`/headless runs never hang regardless. |
| `workflow.team_mode` | string | `auto` | Team mode for `/gsd-autonomous`: `auto` (default — use Agent-team coordination when the runtime + a no-op Agent probe pass, else silently fall back to inline), `off` (force the inline loop even on a capable runtime), or `on` (require it — error if unavailable). Front-loads all human decisions (Decision Harvest), runs a fresh teammate per bounded step, and defers UAT to one end-of-milestone packet. `auto` is safe by construction — it never leaves a half-state on probe failure. See `references/team-mode.md`. |
| `workflow.brainstorm_visual` | string | `auto` | Visual companion for `/gsd-brainstorm`: `auto` (default — always embed Mermaid architecture/flow diagrams in the PRD, and write a self-contained `MOCKUP.html` wireframe only when the runtime can preview rich content), `on` (always write `MOCKUP.html` too, even on text-only runtimes), or `off` (skip visuals — text PRD only). Convergent and capability-gated; never blocks the PRD hard gate. See `references/brainstorm-visuals.md`. |
| `workflow.tdd_mode` | boolean | `false` | Enable TDD pipeline as a first-class execution mode. When `true`, the planner aggressively applies `type: tdd` to eligible tasks (business logic, APIs, validations, algorithms) and the executor enforces RED/GREEN/REFACTOR gate sequence. An end-of-phase collaborative review checkpoint verifies gate compliance. Added in v1.36 |
| `workflow.ai_integration_phase` | boolean | `false` | Legacy AI-phase switch. The feature was removed; the key is kept for config compatibility |
| `workflow.auto_prune_state` | boolean | `false` | When `true`, automatically prune stale entries from STATE.md at phase boundaries instead of prompting |
| `workflow.pattern_mapper` | boolean | `true` | Run the `gsd-pattern-mapper` agent between research and planning to map new files to existing codebase analogs |
| `workflow.subagent_timeout` | number | `600` | Timeout in seconds for individual subagent invocations. Increase for long-running research or execution phases |
| `workflow.inline_plan_threshold` | number | `3` | Maximum number of tasks in a phase before the planner generates a separate PLAN.md file instead of inlining tasks in the prompt |

### Recommended Presets

| Scenario | mode | granularity | profile | research | plan_check | verifier |
|----------|------|-------------|---------|----------|------------|----------|
| Prototyping | `yolo` | `coarse` | `budget` | `false` | `false` | `false` |
| Normal development | `interactive` | `standard` | `balanced` | `true` | `true` | `true` |
| Production release | `interactive` | `fine` | `quality` | `true` | `true` | `true` |

---

## Planning Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `planning.commit_docs` | boolean | `true` | Whether `.planning/` files are committed to git |
| `planning.search_gitignored` | boolean | `false` | Add `--no-ignore` to broad searches to include `.planning/` |
| `planning.sub_repos` | array of strings | `[]` | Paths of nested sub-repos relative to the project root. When set, GSD-aware tooling scopes phase-lookup, path-resolution, and commit operations per sub-repo instead of treating the outer repo as a monorepo |

### Auto-Detection

If `.planning/` is in `.gitignore`, `commit_docs` is automatically `false` regardless of config.json. This prevents git errors.

---

## Hook Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `hooks.context_warnings` | boolean | `true` | Show context window usage warnings via context monitor hook |

The prompt injection guard hook (`gsd-prompt-guard.js`) is always active and cannot be disabled — it's a security feature, not a workflow toggle.

### Private Planning Setup

To keep planning artifacts out of git:

1. Set `planning.commit_docs: false` and `planning.search_gitignored: true`
2. Add `.planning/` to `.gitignore`
3. If previously tracked: `git rm -r --cached .planning/ && git commit -m "chore: stop tracking planning docs"`

---

## Agent Skills Injection

Inject custom skill files into GSD subagent prompts. Skills are read by agents at spawn time, giving them project-specific instructions beyond what CLAUDE.md provides.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agent_skills` | object | `{}` | Map of agent types to skill directory paths |

### Configuration

Add an `agent_skills` section to `.planning/config.json` mapping agent types to arrays of skill directory paths (relative to project root):

```json
{
  "agent_skills": {
    "gsd-executor": ["skills/testing-standards", "skills/api-conventions"],
    "gsd-planner": ["skills/architecture-rules"],
    "gsd-verifier": ["skills/acceptance-criteria"]
  }
}
```

Each path must be a directory containing a `SKILL.md` file. Paths are validated for safety (no traversal outside project root).

### Supported Agent Types

Any GSD agent type can receive skills. Common types:

- `gsd-executor` -- executes implementation plans
- `gsd-planner` -- creates phase plans
- `gsd-checker` -- verifies plan quality
- `gsd-verifier` -- post-execution verification
- `gsd-researcher` -- phase research
- `gsd-project-researcher` -- new-project research
- `gsd-debugger` -- diagnostic agents
- `gsd-codebase-mapper` -- codebase analysis
- `gsd-advisor` -- discuss-phase advisors
- `gsd-roadmapper` -- roadmap creation
- `gsd-synthesizer` -- research synthesis

### How It Works

At spawn time, workflows call `gsd-remix-sdk query agent-skills <type>` (or legacy `node gsd-tools.cjs agent-skills <type>`) to load configured skills. If skills exist for the agent type, they are injected as an `<agent_skills>` block in the Task() prompt:

```xml
<agent_skills>
Read these user-configured skills:
- @skills/testing-standards/SKILL.md
- @skills/api-conventions/SKILL.md
</agent_skills>
```

If no skills are configured, the block is omitted (zero overhead).

### CLI

Set skills via the CLI:

```bash
gsd-remix-sdk query config-set agent_skills.gsd-executor '["skills/my-skill"]'
```

---

## Feature Flags

Toggle optional capabilities via the `features.*` config namespace. Feature flags default to `false` (disabled) — enabling a flag opts into new behavior without affecting existing workflows.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `features.global_learnings` | boolean | `false` | Enable cross-project learnings pipeline (auto-copy at phase completion, planner injection) |
| `learnings.max_inject` | number | `10` | Maximum number of cross-project learnings injected into each planner prompt. Lower values reduce prompt size; higher values provide broader historical context |
| `intel.enabled` | boolean | `false` | Legacy key for the removed codebase intelligence system. Accepted for config compatibility; has no effect |

### Usage

```bash
# Enable a feature
gsd-remix-sdk query config-set features.global_learnings true

# Disable a feature
gsd-remix-sdk query config-set features.global_learnings false
```

The `features.*` namespace is a dynamic key pattern — new feature flags can be added without modifying `VALID_CONFIG_KEYS`. Any key matching `features.<name>` is accepted by the config system.

---

## Parallelization Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `parallelization` | boolean | `true` | Shorthand for `parallelization.enabled`. Setting `parallelization false` disables parallel execution without changing other sub-keys |
| `parallelization.enabled` | boolean | `true` | Run independent plans simultaneously |
| `parallelization.plan_level` | boolean | `true` | Parallelize at plan level |
| `parallelization.task_level` | boolean | `false` | Parallelize tasks within a plan |
| `parallelization.skip_checkpoints` | boolean | `true` | Skip checkpoints during parallel execution |
| `parallelization.max_concurrent_agents` | number | `3` | Maximum simultaneous agents |
| `parallelization.min_plans_for_parallel` | number | `2` | Minimum plans to trigger parallel execution |

> **Pre-commit hooks and parallel execution**: When parallelization is enabled, executor agents commit with `--no-verify` to avoid build lock contention (e.g., cargo lock fights in Rust projects). The orchestrator validates hooks once after each wave completes. STATE.md writes are protected by file-level locking to prevent concurrent write corruption. If you need hooks to run per-commit, set `parallelization.enabled: false`.

---

## Git Branching

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `git.branching_strategy` | enum | `none` | `none`, `phase`, or `milestone` |
| `git.base_branch` | string | `main` | The integration branch that phase/milestone branches are created from and merged back into. Override when your repo uses `master` or a release branch |
| `git.phase_branch_template` | string | `gsd/phase-{phase}-{slug}` | Branch name template for phase strategy |
| `git.milestone_branch_template` | string | `gsd/{milestone}-{slug}` | Branch name template for milestone strategy |
| `git.quick_branch_template` | string or null | `null` | Optional branch name template for `/gsd-quick` tasks |

### Strategy Comparison

| Strategy | Creates Branch | Scope | Merge Point | Best For |
|----------|---------------|-------|-------------|----------|
| `none` | Never | N/A | N/A | Solo development, simple projects |
| `phase` | At `execute-phase` start | One phase | User merges after phase | Code review per phase, granular rollback |
| `milestone` | At first `execute-phase` | All phases in milestone | At `complete-milestone` | Release branches, PR per version |

### Template Variables

| Variable | Available In | Example |
|----------|-------------|---------|
| `{phase}` | `phase_branch_template` | `03` (zero-padded) |
| `{slug}` | Both templates | `user-authentication` (lowercase, hyphenated) |
| `{milestone}` | `milestone_branch_template` | `v1.0` |
| `{num}` / `{quick}` | `quick_branch_template` | `260317-abc` (quick task ID) |

Example quick-task branching:

```json
"git": {
  "quick_branch_template": "gsd/quick-{num}-{slug}"
}
```

### Merge Options at Milestone Completion

| Option | Git Command | Result |
|--------|-------------|--------|
| Squash merge (recommended) | `git merge --squash` | Single clean commit per branch |
| Merge with history | `git merge --no-ff` | Preserves all individual commits |
| Delete without merging | `git branch -D` | Discard branch work |
| Keep branches | (none) | Manual handling later |

---

## Gate Settings

Control confirmation prompts during workflows.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `gates.confirm_project` | boolean | `true` | Confirm project details before finalizing |
| `gates.confirm_phases` | boolean | `true` | Confirm phase breakdown |
| `gates.confirm_roadmap` | boolean | `true` | Confirm roadmap before proceeding |
| `gates.confirm_breakdown` | boolean | `true` | Confirm task breakdown |
| `gates.confirm_plan` | boolean | `true` | Confirm each plan before execution |
| `gates.execute_next_plan` | boolean | `true` | Confirm before executing next plan |
| `gates.issues_review` | boolean | `true` | Review issues before creating fix plans |
| `gates.confirm_transition` | boolean | `true` | Confirm phase transition |

---

## Safety Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `safety.always_confirm_destructive` | boolean | `true` | Confirm destructive operations (deletes, overwrites) |
| `safety.always_confirm_external_services` | boolean | `true` | Confirm external service interactions |

---

## Security Settings

Settings for the security enforcement feature (v1.31). All follow the **absent = enabled** pattern. These keys live under `workflow.*` in `.planning/config.json` — matching the shipped template and the runtime reads in `workflows/plan-phase.md`, `workflows/execute-phase.md`, `workflows/secure-phase.md`, and `workflows/verify-work.md`.

These keys live under `workflow.*` — that is where the workflows and installer write and read them. Setting them at the top level of `config.json` is silently ignored.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `workflow.security_enforcement` | boolean | `false` | Legacy threat-model-anchored security verification. Keep the key explicit — absent is treated as enabled by some readers |
| `workflow.security_review` | string | `"auto"` | Diff-scoped security review trigger: `auto` reviews when the diff touches security-relevant surface, `always` reviews every phase, `off` disables |

---

## Manager Passthrough Flags

Legacy keys retained for config compatibility (the `/gsd-manager` command was removed). When present, they define per-step flags appended to dispatched discuss, plan, and execute commands.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `manager.flags.discuss` | string | (none) | Flags appended to discuss-phase commands (e.g., `"--auto"`) |
| `manager.flags.plan` | string | (none) | Flags appended to plan-phase commands (e.g., `"--skip-research"`) |
| `manager.flags.execute` | string | (none) | Flags appended to execute-phase commands (e.g., `"--validate"`) |

**Example:**

```json
{
  "manager": {
    "flags": {
      "discuss": "--auto",
      "plan": "--skip-research",
      "execute": "--validate"
    }
  }
}
```

Invalid flag tokens are sanitized and logged as warnings. Only recognized GSD flags are passed through.

---

## Model Profiles

### Profile Definitions

All named profiles (`quality`, `balanced`, `budget`) now resolve to a single allocation — Opus where reasoning quality matters most, Sonnet everywhere else. The profile names remain valid config values for compatibility. `inherit` makes every agent follow the current session model instead.

| Agent | Model (all named profiles) | `inherit` |
|-------|----------------------------|-----------|
| gsd-planner | Opus | Inherit |
| gsd-roadmapper | Opus | Inherit |
| gsd-phase-researcher | Opus | Inherit |
| gsd-project-researcher | Opus | Inherit |
| gsd-debugger | Opus | Inherit |
| gsd-executor | Sonnet | Inherit |
| gsd-research-synthesizer | Sonnet | Inherit |
| gsd-codebase-mapper | Sonnet | Inherit |
| gsd-verifier | Sonnet | Inherit |
| gsd-plan-checker | Sonnet | Inherit |
| gsd-integration-checker | Sonnet | Inherit |
| gsd-pattern-mapper | Sonnet | Inherit |

> **Fallback semantics for unlisted agents.** The profiles table above covers 12 of 18 shipped agents. Agents without an explicit profile row (`gsd-advisor-researcher`, `gsd-assumptions-analyzer`, `gsd-security-auditor`, `gsd-code-reviewer`, `gsd-code-fixer`, `gsd-debug-session-manager`) resolve to Sonnet. To pin a specific model for any of these agents, use `model_overrides` (next section) — `model_overrides` accepts any shipped agent name regardless of whether it has a profile row here. The authoritative profile table lives in `get-shit-done/bin/lib/model-profiles.cjs`; the authoritative 18-agent roster lives in [`docs/INVENTORY.md`](INVENTORY.md).

### Per-Agent Overrides

Override specific agents without changing the entire profile:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "gsd-executor": "opus",
    "gsd-planner": "haiku"
  }
}
```

Valid override values: `opus`, `sonnet`, `haiku`, `inherit`, or any fully-qualified model ID (e.g., `"openai/o3"`, `"google/gemini-2.5-pro"`).

### Non-Claude Runtimes (Codex, OpenCode, Gemini CLI, Kilo)

When GSD is installed for a non-Claude runtime, the installer automatically sets `resolve_model_ids: "omit"` in `~/.gsd/defaults.json`. This causes GSD to return an empty model parameter for all agents, so each agent uses whatever model the runtime is configured with. No additional setup is needed for the default case.

If you want different agents to use different models, use `model_overrides` with fully-qualified model IDs that your runtime recognizes:

```json
{
  "resolve_model_ids": "omit",
  "model_overrides": {
    "gsd-planner": "o3",
    "gsd-executor": "o4-mini",
    "gsd-debugger": "o3",
    "gsd-codebase-mapper": "o4-mini"
  }
}
```

The intent is the same as the Claude profile tiers -- use a stronger model for planning and debugging (where reasoning quality matters most), and a cheaper model for execution and mapping (where the plan already contains the reasoning).

**When to use which approach:**

| Scenario | Setting | Effect |
|----------|---------|--------|
| Non-Claude runtime, single model | `resolve_model_ids: "omit"` (installer default) | All agents use the runtime's default model |
| Non-Claude runtime, tiered models | `resolve_model_ids: "omit"` + `model_overrides` | Named agents use specific models, others use runtime default |
| Claude Code with OpenRouter/local provider | `model_profile: "inherit"` | All agents follow the session model |
| Claude Code with OpenRouter, tiered | `model_profile: "inherit"` + `model_overrides` | Named agents use specific models, others inherit |

**`resolve_model_ids` values:**

| Value | Behavior | Use When |
|-------|----------|----------|
| `false` (default) | Returns Claude aliases (`opus`, `sonnet`, `haiku`) | Claude Code with native Anthropic API |
| `true` | Maps aliases to full Claude model IDs (`claude-opus-4-6`) | Claude Code with API that requires full IDs |
| `"omit"` | Returns empty string (runtime picks its default) | Non-Claude runtimes (Codex, OpenCode, Gemini CLI, Kilo) |

### Profile Philosophy

| Profile | Philosophy | When to Use |
|---------|-----------|-------------|
| `quality` / `balanced` / `budget` | Opus for planning, research, and debugging; Sonnet for everything else (all three names resolve identically) | Normal development (default: `balanced`) |
| `inherit` | All agents use current session model | Dynamic model switching, **non-Anthropic providers** (OpenRouter, local models) |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CONFIG_DIR` | Override default config directory (`~/.claude/`) |
| `GEMINI_API_KEY` | Detected by context monitor to switch hook event name |
| `WSL_DISTRO_NAME` | Detected by installer for WSL path handling |
| `GSD_SKIP_SCHEMA_CHECK` | Skip schema drift detection during execute-phase (v1.31) |
| `GSD_PROJECT` | Override the project root GSD operates on (v1.32) |

---

## Global Defaults

Save settings as global defaults for future projects:

**Location:** `~/.gsd/defaults.json`

When `/gsd-new-project` creates a new `config.json`, it reads global defaults and merges them as the starting configuration. Per-project settings always override globals.
