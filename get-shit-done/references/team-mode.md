# Team Mode (autonomous milestone execution with Agent teammates)

Team mode is a capability-gated variant of `/gsd-autonomous`. When Claude Code's
Agent-team features are available, the milestone loop runs as a **Team Lead**
coordinating fresh per-step teammates, with all human decisions front-loaded and
UAT deferred to a single end-of-milestone packet.

This file is the **self-contained** spec — gsd-remix ships it; it depends on no
external skill. `autonomous.md` reads and follows this file only when the team
gate passes.

Three mechanisms, one contract:

1. **Decision Harvest (front-load all human decisions)** — before any planning or
   execution, gather every human decision across the in-scope phases.
2. **Fresh teammate per bounded step** — each GSD step is one new `Agent`
   invocation; never reused across steps.
3. **Deferred UAT** — collect UAT items per phase, deliver one consolidated packet
   at milestone end.

---

## Capability gate + probe (run BEFORE any Decision Harvest / before writing any artifact)

Team mode is controlled by config `workflow.team_mode: auto | on | off`.

**Shipped default is `auto`.** `auto` is safe by construction — it only engages when
the coarse runtime gate and the no-op Agent probe both pass, and silently falls back
to the inline loop otherwise, so it never leaves a half-state. Set `off` to force the
inline loop even on a capable runtime, or `on` to require team mode (error if the
probe fails).

Two-tier detection:

1. **Coarse gate — runtime identity.** Team mode requires the Claude Code runtime
   (the Agent tool + SendMessage). Read runtime identity:
   ```bash
   RUNTIME=$(gsd-remix-sdk query runtime.health 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).runtime_identity?.runtime||'')}catch{console.log('')}})")
   ```
   `runtime_identity.runtime` is a string (e.g. `claude`, `codex`, `gemini`) — the
   coarse gate passes only when `RUNTIME` equals `claude`. Any other value (or empty)
   means team mode is unavailable.

2. **Fine gate — deterministic no-op Agent probe.** Spawn one trivial Agent that
   must return a fixed token (e.g. `Agent(prompt="reply with exactly: TEAM_OK")`).
   Success means the Agent tool + coordination are actually usable. Run this probe
   **before** the first Decision Harvest and **before** writing any phase artifact.

Probe outcomes by `team_mode`:

| team_mode | runtime not Claude / probe fails | probe succeeds |
|-----------|----------------------------------|----------------|
| `off`     | do not probe; run inline (current autonomous loop) | — (never probed) |
| `auto`    | **silently fall back to inline** — no error, no half-state | run team mode |
| `on`      | **error and stop** — do not silently downgrade | run team mode |

**Never write a half state on probe failure.** A successful probe does NOT mean
every later teammate spawn will succeed — each spawn failure must also fall back
gracefully and preserve the checkpoint (below).

---

## Flag matrix

- **Harvest scope = the `--from` / `--to` / `--only` filter**, not always the whole
  milestone. Only harvest decisions for phases in the active window.
- **Team mode beats `--interactive`.** Team mode is strictly sequential post-harvest;
  it conflicts with `--interactive`'s pipeline. If both are set, team wins and
  `--interactive` is ignored with a one-line notice.
- **`--auto` does NOT disable team mode.** It means "after harvest completes, run
  unattended": harvest interactively (if there are decisions), then execute the
  rest without stopping. If nothing needs harvesting, proceed unattended directly.
- **Resume checkpoint.** Record which phases have been harvested and which bounded
  steps have completed, so a killed run resumes without re-harvesting or
  re-executing finished steps. Never re-harvest a phase already recorded as harvested.

---

## Mechanism 1 — Decision Harvest (front-load)

The first Lead action, before any planning/execution. For each incomplete in-scope
phase, spawn one fresh discuss teammate (see `teammate-prompts.md`).

- **Parallelism:** read-only discovery may run in parallel across phases. The
  `AskUserQuestion` interactions must be **serialized** — only one phase's questions
  reach the user at a time. Stagger spawns or have teammates wait their turn.
- Each discuss teammate: read phase intent + prior notes → separate human decisions
  from researchable facts → ask the user only for genuine human decisions
  (product/priority/UX/policy/scope/risk/irreversible/preference) → record decisions
  into GSD artifacts → report confirmed decisions + researchable facts (or a
  justified `none`) to the Lead.
- The Lead must NOT answer discuss questions on the user's behalf during harvest.
- After harvest, the Lead tells the user the rest runs unattended and they can step
  away until the UAT packet (or a true escalation).

**Conservative dependency labeling.** Every harvested decision is tagged:
- `stable_now` — safe to decide now. **Only** product goals, risk tolerance,
  non-goals, and naming preferences qualify.
- `depends_on_phase_output` — the question references a future phase's data
  structure / API / UX artifact. **Default to this whenever in doubt.**
- `defer_until_phase_N` — decide just-in-time before phase N.

Deferred decisions go into a mini-discuss queue, handled just-in-time by the Lead
before the phase that needs them — not forced up front.

---

## Mechanism 2 — Fresh teammate per bounded step

After harvest, process phases in dependency order, spawning one teammate per bounded
GSD step (plan / research / execute / review / verify / UAT-packet / fix).

- One `Agent` invocation per step, with a `name` (addressable via `SendMessage`) and
  `subagent_type` set to the matching GSD agent when one exists (`gsd-planner`,
  `gsd-executor`, `gsd-code-reviewer`, …).
- Scope each teammate to **exactly one** step; it reports a handoff (changed files,
  commands, results, risks, deferred UAT items, next-step implication) and shuts down.
- Use `run_in_background: true` only when the Lead must coordinate via `SendMessage`
  while it works; shut it down with a `shutdown_request`.
- **Never reuse a teammate across steps** — a new step is a new `Agent` invocation,
  never a `SendMessage` resuming a prior step's agent. Fresh context per step keeps
  each step auditable.
- Every post-harvest step runs strictly sequentially in dependency order (only the
  harvest discovery may parallelize).
- If a spawn fails: fall back to running that step inline in the current context,
  preserve the checkpoint, and continue — do not lose progress.

---

## Mechanism 3 — Deferred UAT

Do not interrupt the user for UAT after each phase. For every phase collect:
scenario name, exact steps, expected result, affected area, setup/data needs, and
diagnostic output that would help. After all phases are implemented and automated
verification has run (or been honestly reported), present **one** consolidated UAT
packet. If failures appear, triage into a fix queue, assign fresh fix teammates,
re-verify, then ask for one final focused UAT pass.

---

## Escalation (pause the unattended run only for)

Missing product decisions not inferable from milestone intent; mutually exclusive
scope choices; permission for destructive git/fs/deploy/production actions;
credentials / private accounts / user-only session state; legal/compliance/security/
business-risk choices; a repeated blocker after real research; contradictions
between prior decisions and current requirements. Do not pause for routine
implementation details that have an established pattern or a researchable answer.

---

## Completion criteria

Do not call the milestone complete until: all harvest decisions recorded; all planned
phases executed or explicitly deferred; every teammate reported and shut down;
automated verification run (or its absence documented); code review / self-review
performed; one consolidated UAT packet delivered; UAT failures fixed or converted to
explicit follow-up work.
