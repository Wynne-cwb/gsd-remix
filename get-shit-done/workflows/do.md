<purpose>
Analyze freeform text from the user and route to the most appropriate GSD command. This is a dispatcher — it never does the work itself. Match user intent to the best command, confirm the routing, and hand off.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="validate">
**Check for input.**


**Text mode (`workflow.text_mode: true` in config or `--text` flag):** Set `TEXT_MODE=true` if `--text` is present in `$ARGUMENTS` OR `text_mode` from init JSON is `true`. When TEXT_MODE is active, replace every `AskUserQuestion` call with a plain-text numbered list and ask the user to type their choice number. This is required for non-Claude runtimes (OpenAI Codex, Gemini CLI, etc.) where `AskUserQuestion` is not available.
If `$ARGUMENTS` is empty, ask via AskUserQuestion:

```
What would you like to do? Describe the task, bug, or idea and I'll route it to the right GSD command.
```

Wait for response before continuing.
</step>

<step name="check_project">
**Check if project exists.**

```bash
INIT=$(gsd-remix-sdk query state.load 2>/dev/null)
```

Track whether `.planning/` exists — some routes require it, others don't.
</step>

<step name="route">
**Match intent to command.**

Evaluate `$ARGUMENTS` against these routing rules. Apply the **first matching** rule:

| If the text describes... | Route to | Why |
|--------------------------|----------|-----|
| Starting a new project, "set up", "initialize" | `/gsd-new-project` | Needs full project initialization |
| Mapping or analyzing an existing codebase | `/gsd-map-codebase` | Codebase discovery |
| A bug, error, crash, failure, or something broken | `/gsd-debug` | Needs systematic investigation |
| Exploring, researching, comparing, or "how does X work" | `/gsd-research-phase` | Domain research before planning |
| Discussing vision, "how should X look", brainstorming | `/gsd-discuss-phase` | Needs context gathering |
| Planning a specific phase or "plan phase N" | `/gsd-plan-phase` | Direct planning request |
| Executing a phase or "build phase N", "run phase N" | `/gsd-execute-phase` | Direct execution request |
| Running all remaining phases automatically | `/gsd-autonomous` | Full autonomous execution |
| A review or quality concern about existing work | `/gsd-verify-work` | Needs verification |
| Checking progress, status, "where am I" | `/gsd-progress` | Status check |
| Resuming work, "pick up where I left off" | `/gsd-resume-work` | Session restoration |
| A note, idea, or "remember to..." | `/gsd-add-todo` | Capture for later |
| Adding tests, "write tests", "test coverage" | `/gsd-add-tests` | Test generation |
| Completing a milestone, shipping, releasing | `/gsd-complete-milestone` | Milestone lifecycle |
| **Building or changing code** — feature, fix, refactor, migration, task (any size) | **size router** → go to `size_route` step | Dispatch by task体量 to LIGHT / MEDIUM / HEAVY |

The last row is the **size axis**: the intent is "write/change code" but the *size* (体量) is unknown. Do NOT statically pick a command — go to the `size_route` step, which gathers deterministic evidence and recommends a lane. Every other row is the **intent axis** and dispatches directly (skip `size_route`).

**Requires `.planning/` directory:** All routes except `/gsd-new-project`, `/gsd-map-codebase`, and `/gsd-help`. If the project doesn't exist and the route requires it, suggest `/gsd-new-project` first.

**Ambiguity handling:** If the text could reasonably match multiple *intent* routes (e.g. debug vs research), ask the user via AskUserQuestion with the top 2-3 options. Size ambiguity (small vs large code change) is NOT resolved here — that is the `size_route` step's job.
</step>

<step name="size_route">
**Size axis — dispatch a code change by 体量 (only when the `route` step chose "size router").**

This is a two-layer classifier (design D5, `.plans/gsd-final-form-design.md`): a
deterministic evidence layer (SDK) plus this LLM judgment layer. The router
**never writes a persistent artifact** — the target lane records anything worth
keeping.

**1. Gather candidate paths.** From `$DESCRIPTION`, infer the files/dirs the change
would most likely touch (explicit mentions; otherwise a quick `Glob`/`Grep` for the
named feature). A best-effort short list is fine — this is evidence, not the work.

**2. Get deterministic evidence.**

```bash
EVIDENCE=$(gsd-remix-sdk query route.size-classify "$DESCRIPTION" --paths "path1,path2,...")
```

Returns `{ risk_hits, max_risk_strength, hard_surfaces, surface_count, candidate_files, unknowns }`.
It emits **evidence only** — it does not choose a lane and does not read requirement
semantics. `hard_surfaces` are high-risk surfaces the scan judged as actually touched;
`unknowns` (e.g. `no_candidate_files`, `vague_scope`) mean the evidence is thin.

**3. Judge the lane (apply top-down, first match wins):**

1. `hard_surfaces` non-empty (auth/session/token, payment/billing, migration/schema, public API, webhook, tenant/org, PII/logging, CORS/cookie/redirect, unsafe HTML, BFF outbound) → **HEAVY**. Escalation 铁律 — never overridden by "it looks small".
2. Introduces new architecture / new dependency / new data model, or greenfield → **HEAVY**.
3. Touches multiple files, or has an unresolved decision point → **MEDIUM**.
4. One-sentence diff, no new decision, no high-risk surface → **LIGHT**.
5. `unknowns` make the size unclear → **MEDIUM** (conservative floor — **never LIGHT**).

Assign a `confidence: low | medium | high`. **`confidence: low` forbids LIGHT** — floor to MEDIUM.

**4. Map lane → command (D6):**

| Lane | Command | Notes |
|------|---------|-------|
| LIGHT | `/gsd-fast` | inline, no plan/subagent |
| MEDIUM | `/gsd-quick` | planner + executor, `.planning/quick/` |
| HEAVY | see **HEAVY spec-first gate** below | clarify → full plan/build/verify cycle |

**HEAVY spec-first gate (brainstorm before roadmap).** A HEAVY change earns a spec
before a roadmap. Decide the HEAVY entry point:

- **Spec still unripe** — greenfield, `vague_scope` in `unknowns`, or no approved PRD
  exists for this work → route to **`/gsd-brainstorm`** first. It converges the idea
  into `prds/<date>-<topic>/PRD.md` and HARD-GATES for approval; the approved PRD then
  feeds `/gsd-new-milestone --prd` (project exists) or `/gsd-new-project --prd`
  (greenfield). Check for an existing approved PRD before routing here:
  ```bash
  ls prds/*/PRD.md 2>/dev/null | head -1   # if one exists with status: approved, skip brainstorm
  ```
- **Spec already ripe** — the request is concrete/spec'd, or an approved PRD already
  exists → skip brainstorm and route directly to `/gsd-new-project` (no project yet)
  or `/gsd-add-phase` (project exists) for the full plan/build/verify cycle.

Do not force a PRD onto an already-clear HEAVY request; brainstorm is the front of the
funnel only when the requirement is still vague.

**5. Confirm (do not silently auto-run).** Present the recommendation **with the evidence
and its uncertainty** — describe what was and was NOT observed ("scan did not find any
route/migration/auth files being touched"), never "looks simple". Let the user accept or
pick a different lane:

```
AskUserQuestion(
  header: "Task Size",
  question: "This looks like a ${LANE} change — ${one-line evidence}. Proceed?",
  options: [
    { label: "${LANE} (recommended)", description: "${why, incl. confidence + key evidence}" },
    { label: "${adjacent lane}", description: "${when to pick this instead}" },
    { label: "Heavier — full flow", description: "Plan/build/verify cycle" }
  ],
  multiSelect: false
)
```

Never trust "the user thinks it's simple" and never count lines. If `confidence: low`,
say so and offer MEDIUM/HEAVY only.

**6. Auto path (no stopping).** If `--auto`/headless, or `TEXT_MODE` with no interactive
channel: adopt the recommended lane directly; when `confidence: low`, conservatively
escalate one step (LIGHT→MEDIUM) rather than pausing. In `TEXT_MODE` interactive, replace
`AskUserQuestion` with a numbered list and read the typed choice.

Store the resolved command as the dispatch target and continue to `display`.
</step>

<step name="display">
**Show the routing decision.**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► ROUTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Input:** {first 80 chars of $ARGUMENTS}
**Routing to:** {chosen command}
**Reason:** {one-line explanation}
```
</step>

<step name="dispatch">
**Invoke the chosen command.**

Run the selected `/gsd-*` command, passing `$ARGUMENTS` as args.

If the chosen command expects a phase number and one wasn't provided in the text, extract it from context or ask via AskUserQuestion.

After invoking the command, stop. The dispatched command handles everything from here.
</step>

</process>

<success_criteria>
- [ ] Input validated (not empty)
- [ ] Intent matched to exactly one GSD command (intent axis)
- [ ] Code-change intents routed by size via `size_route` (LIGHT / MEDIUM / HEAVY)
- [ ] Size lane derived from `route.size-classify` evidence + judgment, not line counts or user's guess
- [ ] Hard high-risk surface forces HEAVY; `confidence: low` never routes LIGHT; `unknowns` floor to MEDIUM
- [ ] HEAVY with an unripe spec (greenfield / `vague_scope` / no approved PRD) routes to `/gsd-brainstorm` first; a ripe/spec'd HEAVY request skips brainstorm
- [ ] Lane confirmed with evidence shown (unless `--auto`/headless — then adopt, escalate conservatively, no stop)
- [ ] Ambiguity resolved via user question (if needed)
- [ ] Project existence checked for routes that require it
- [ ] Routing decision displayed before dispatch
- [ ] Command invoked with appropriate arguments
- [ ] No work done directly, no persistent artifact written — dispatcher only
</success_criteria>
