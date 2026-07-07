# Team Mode (autonomous milestone execution with agent teammates)

Team mode is a capability-gated variant of `/gsd-autonomous`. When the runtime has a
**multi-agent capability**, the milestone loop runs as a **Team Lead** coordinating
fresh per-step teammates, with all human decisions front-loaded and UAT deferred to a
single end-of-milestone packet.

Two runtimes qualify today, with **different fan-out shapes** (see *Runtime team driver*):

- **Claude Code** (the `Agent` tool + `SendMessage`) — supports nested spawning, so
  the Lead stays a thin supervisor: each bounded step is delegated to its own teammate,
  which may itself fan out (e.g. an execute teammate spawns wave workers).
- **Codex** (`multi_agent_v1.spawn_agent` / `wait_agent` / `close_agent`) — a spawned
  child **cannot reliably spawn its own children** (verified). So Codex runs
  **single-level**: the Lead is the **sole spawner and the orchestrator itself**, and
  every teammate is a **leaf that never spawns**. See *Runtime team driver* for the
  full rule set.

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

1. **Coarse gate — runtime identity.** Team mode requires a runtime with a
   multi-agent capability. Read runtime identity:
   ```bash
   RUNTIME=$(gsd-remix-sdk query runtime.health 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).runtime_identity?.runtime||'')}catch{console.log('')}})")
   ```
   `runtime_identity.runtime` is a string (e.g. `claude`, `codex`, `gemini`) — the
   coarse gate passes when `RUNTIME` is `claude` (the `Agent` tool) **or** `codex`
   (the `multi_agent_v1.spawn_agent` tool is present). Any other value (or empty)
   means team mode is unavailable. The runtime chosen here selects the fan-out shape
   in *Runtime team driver*.

2. **Fine gate — deterministic no-op Agent probe.** Spawn one trivial teammate that
   must return a fixed token, using the runtime's spawn primitive:
   - Claude: `Agent(prompt="reply with exactly: TEAM_OK")`.
   - Codex: `spawn_agent(message="reply with exactly: TEAM_OK")`, then `wait_agent`.

   Success means the spawn primitive is actually usable. Run this probe **before**
   the first Decision Harvest and **before** writing any phase artifact. On Codex,
   this only proves the Lead can spawn a **leaf** — it does NOT imply nested spawning
   (which Codex does not support); the single-level rules below still apply.

Probe outcomes by `team_mode`:

| team_mode | runtime not capable / probe fails | probe succeeds |
|-----------|----------------------------------|----------------|
| `off`     | do not probe; run inline (current autonomous loop) | — (never probed) |
| `auto`    | **silently fall back to inline** — no error, no half-state | run team mode |
| `on`      | **error and stop** — do not silently downgrade | run team mode |

**Never write a half state on probe failure.** A successful probe does NOT mean
every later teammate spawn will succeed — each spawn failure must also fall back
gracefully and preserve the checkpoint (below).

---

## Runtime team driver (spawn / wait / collect / close)

The mechanisms below are written in runtime-neutral terms. Map the abstract
operations to the active runtime; **honor the Codex column's hard rules** — they are
not preferences, they follow from Codex's verified single-level spawning limit.

| Abstract op | Claude Code | Codex |
|---|---|---|
| spawn a teammate | `Agent(subagent_type=…, prompt=…)` (may nest) | `spawn_agent(message=…)` — **leaf only, must not spawn** |
| wait for completion | Agent result / `SendMessage` | `wait_agent(ids, timeout)` — blocks to terminal or timeout |
| collect its result | teammate's returned text | read the teammate's **on-disk artifact** (e.g. `*-QUESTIONS.json`, `SUMMARY.md`); do not depend on returned text |
| release it | (implicit) | `close_agent(id)` — required; open/finished agents occupy the concurrency budget |
| resume with input | new `Agent` (never reuse) | prefer a **fresh leaf reading the on-disk state** over `resume_agent`; state lives in files, not agent memory |

**Hard rules (both runtimes unless noted):**

1. **Codex is single-level.** The Lead is the **sole spawner** and runs each step's
   **orchestration itself** (it cannot delegate a whole step to a teammate that then
   sub-spawns). Every spawned teammate is a **leaf that never calls `spawn_agent`**.
   Claude may nest (Lead → step teammate → wave workers); Codex may not.
2. **`wait_agent` timeout means "not done yet", never "inactive".** There is no
   liveness/progress API — do not poll for stalls or restart on silence. Decide
   completion from **terminal status + on-disk evidence** (artifacts, git diff).
3. **Batch to a concurrency cap.** The Codex concurrency limit is not guaranteed by
   schema — fan out at most `workflow.team_max_parallel` leaves at a time (default
   **3**), `close_agent` each as it finishes to free a slot, then spawn the next.
   Never spawn one-per-phase unbounded.
4. **Spawn unavailable or cap exhausted → run that unit inline.** Falling back to
   inline (in the Lead's own context) is always correct; it only costs parallelism.
   Never hard-block a step that can run inline.
5. **On Codex, invoke a GSD step by loading and executing its workflow** (read the
   `*.md` and run it, or call the SDK) — never by mentioning `$gsd-*` (a mention does
   not trigger a skill; see the Codex skill adapter).

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

**On Codex (single-level harvest via `--power`):** the discuss leaf MUST run
`gsd-discuss-phase <phase> --power`, not the default discuss. This is required, not
stylistic — the default discuss-phase spawns advisor sub-agents (`Task()`), which from
a spawned leaf would be second-level spawning that Codex cannot do; `--power` runs
`discuss-phase-power.md`, which spawns nothing (a true leaf) and writes all questions
up front to `<phase>-QUESTIONS.json`. Harvest as a **Question Barrier over file state**:

1. Fan out `--power` leaves (batched to `workflow.team_max_parallel`), one per in-scope phase;
   each generates its `<phase>-QUESTIONS.json` and stops (does not enter the interactive
   wait loop). `close_agent` each after its JSON exists — the file is the durable state.
2. Read every phase's `*-QUESTIONS.json`, consolidate into **one** packet, and ask the
   user once (serialized — never drip phase-by-phase). Use `request_user_input`, or a
   plain-text numbered list when it can't carry the packet cleanly.
3. Write the answers back into each `*-QUESTIONS.json`, then run the `--power` finalize
   path per phase (a fresh leaf reading the JSON, or inline) to produce `*-CONTEXT.md`.
4. If an answer exposes a genuine follow-up, re-open the barrier across unfinished
   phases and ask one more consolidated packet — do not ask follow-ups one at a time.

Because the state lives in `*-QUESTIONS.json`/`*-CONTEXT.md` on disk, the barrier never
depends on keeping a leaf alive across the user-answer gap or on `resume_agent`. If
spawning is unavailable or the phase count exceeds the cap, run the same `--power`
generate → ask → finalize sequence **inline**; the barrier still holds.

> **Trade-off (accepted):** `--power` is a leaf, so it runs **without advisor research**.
> Codex harvest therefore surfaces questions from the Lead's own analysis rather than
> parallel advisor recommendations. The Lead may do narrow inline research to tell a
> human decision apart from a researchable fact, but per-phase advisor parity is a
> future step, not part of this single-level harvest.

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

**On Codex (single-level per step):** the Lead does **not** delegate a whole step to a
teammate that then sub-spawns (that would be second-level). Instead the Lead **runs the
step's orchestration itself** and fans out only the step's leaf workers directly:

- **plan / research / review / verify** — the Lead runs the workflow inline; where it
  would spawn helpers (researcher, reviewer), those become the Lead's own direct leaves
  (one level), or run inline if spawning is unavailable.
- **execute** — the Lead runs `execute-phase`'s orchestration and spawns the per-plan
  `gsd-executor` **wave workers as direct leaves** (one level), preserving wave
  parallelism. `gsd-executor` is already a leaf (it does not spawn), so the single-level
  limit is never violated. If spawning is unavailable or the cap is exhausted,
  `execute-phase`'s built-in sequential-inline path runs the plans in the Lead's context
  — correct, just serial.

The only cost vs Claude: the Codex Lead is not a thin pure-supervisor — it carries each
step's orchestration context itself (the same profile as running that workflow directly).

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
