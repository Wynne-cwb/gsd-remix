# Model Profiles

Model profiles control which Claude model each GSD agent uses. This allows balancing quality vs token spend, or inheriting the currently selected session model.

## Profile Definitions

All named profiles (`quality` / `balanced` / `budget` / `adaptive`) resolve to the same unified allocation — the profile keys are kept for config compatibility, not differentiation. `inherit` resolves every agent to the current session model.

| Agent | All profiles | `inherit` |
|-------|--------------|-----------|
| gsd-planner | opus | inherit |
| gsd-roadmapper | opus | inherit |
| gsd-phase-researcher | opus | inherit |
| gsd-project-researcher | opus | inherit |
| gsd-debugger | opus | inherit |
| gsd-executor | sonnet | inherit |
| gsd-research-synthesizer | sonnet | inherit |
| gsd-codebase-mapper | sonnet | inherit |
| gsd-verifier | sonnet | inherit |
| gsd-plan-checker | sonnet | inherit |
| gsd-integration-checker | sonnet | inherit |
| gsd-pattern-mapper | sonnet | inherit |

Agents not in the table (e.g. gsd-advisor-researcher) resolve to `sonnet` via the default fallback.

## Profile Philosophy

**Unified allocation** (all named profiles)
- Opus for planning, roadmapping, research, and debugging — where reasoning quality has the highest downstream impact and the call frequency is low (once per phase)
- Sonnet for execution, verification, checking, and mapping — these follow explicit instructions produced by the Opus tier
- Research quality directly determines plan quality, so both researchers ride the Opus tier

**Executor escape hatch**
The executor stays on Sonnet by default (plans carry the reasoning; execution is implementation). If a phase's implementation itself demands top-tier reasoning, override just the executor without touching the profile:

```json
{
  "model_overrides": {
    "gsd-executor": "opus"
  }
}
```

`model_overrides` takes precedence over the profile table (resolution order: override > profile > default). This turns the "small tasks run inline on Opus, big tasks spawn on Sonnet" inversion into a conscious, per-project choice.

**inherit** - Follow the current session model
- All agents resolve to `inherit`
- Best when you switch models interactively (for example OpenCode or Kilo `/model`)
- **Required when using non-Anthropic providers** (OpenRouter, local models, etc.) — otherwise GSD may call Anthropic models directly, incurring unexpected costs
- Use when: you want GSD to follow your currently selected runtime model

## Using Non-Claude Runtimes (Codex, OpenCode, Gemini CLI, Kilo)

When installed for a non-Claude runtime, the GSD installer sets `resolve_model_ids: "omit"` in `~/.gsd/defaults.json`. This returns an empty model parameter for all agents, so each agent uses the runtime's default model. No manual setup is needed.

To assign different models to different agents, add `model_overrides` with model IDs your runtime recognizes:

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

The same tiering logic applies: stronger models for planning and debugging, cheaper models for execution and mapping.

## Using Claude Code with Non-Anthropic Providers (OpenRouter, Local)

If you're using Claude Code with OpenRouter, a local model, or any non-Anthropic provider, set the `inherit` profile to prevent GSD from calling Anthropic models for subagents:

```bash
# Via settings command
/gsd-settings
# → Select "Inherit" for model profile

# Or manually in .planning/config.json
{
  "model_profile": "inherit"
}
```

Without `inherit`, GSD's default `balanced` profile spawns specific Anthropic models (`opus`, `sonnet`, `haiku`) for each agent type, which can result in additional API costs through your non-Anthropic provider.

## Resolution Logic

Orchestrators resolve model before spawning:

```
1. Read .planning/config.json
2. Check model_overrides for agent-specific override
3. If no override, look up agent in profile table
4. Pass model parameter to Task call
```

## Per-Agent Overrides

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

Overrides take precedence over the profile. Valid values: `opus`, `sonnet`, `haiku`, `inherit`, or any fully-qualified model ID (e.g., `"o3"`, `"openai/o3"`, `"google/gemini-2.5-pro"`).

## Switching Profiles

Runtime: `/gsd-settings` (model profile section)

Per-project default: Set in `.planning/config.json`:
```json
{
  "model_profile": "balanced"
}
```

## Design Rationale

**Why Opus for gsd-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for gsd-executor?**
Executors follow explicit PLAN.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Opus for the researchers?**
Research quality directly determines plan quality, and each researcher runs at most once per phase — a low-frequency, high-leverage path.

**Why Sonnet (not Haiku) for verifiers?**
Verification requires goal-backward reasoning - checking if code *delivers* what the phase promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why `inherit` instead of passing `opus` directly?**
Claude Code's `"opus"` alias maps to a specific model version. Organizations may block older opus versions while allowing newer ones. GSD returns `"inherit"` for opus-tier agents, causing them to use whatever opus version the user has configured in their session. This avoids version conflicts and silent fallbacks to Sonnet.

**Why `inherit` profile?**
Some runtimes (including OpenCode) let users switch models at runtime (`/model`). The `inherit` profile keeps all GSD subagents aligned to that live selection.
