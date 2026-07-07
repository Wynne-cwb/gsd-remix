<purpose>
Requirement-level clarification (D3, middle tier): converge a rough idea into an
approved PRD. This is a **gsd-remix native** capability (D0/D4) — self-contained, no
external skill dependency. It is convergent only (idea → PRD); divergent ideation is
out of scope. A **capability-gated, degradable visual companion** (native to
gsd-remix — no external skill, no MCP dependency) renders the *converged* idea as UI
mockups + architecture/flow diagrams to help you confirm before approving; it degrades
to Mermaid-in-PRD on text-only runtimes and never blocks the gate — see
`references/brainstorm-visuals.md`. The PRD is a HARD GATE: nothing downstream runs
until the user approves it.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse">
The idea/topic is `$ARGUMENTS`. If empty, ask (plain text, not AskUserQuestion):
"What's the idea? One or two sentences is fine — we'll sharpen it together."
Store as `$IDEA`.
</step>

<step name="converge">
Converge the idea through **targeted** questions — not open-ended ideation. Cover the
dimensions that change what gets built; skip any the idea already answers:

1. **Problem** — what's broken / missing, and for whom, right now?
2. **Users & jobs** — who uses this and what are they trying to do?
3. **Scope & non-goals** — what's explicitly in, and what's explicitly OUT (v1)?
4. **Success criteria** — how do we know it worked? (observable, testable — phrase
   EARS-style per `references/stolen-parts.md` §3 where it fits).
5. **Constraints** — tech, data, compliance, timeline, dependencies.

Use `AskUserQuestion` with concrete options where you have an opinion; **text mode**
(`workflow.text_mode` or `--text`) → numbered lists. Keep it tight: a few focused
rounds, not a survey. Do not decide product/scope questions for the user.
</step>

<step name="draft">
Draft the PRD from the converged answers. Compute the topic slug + date:

```bash
DATE=$(gsd-remix-sdk query current-timestamp date 2>/dev/null || date +%Y-%m-%d)
SLUG=$(gsd-remix-sdk query generate-slug "$IDEA" 2>/dev/null)
PRD_DIR="prds/${DATE}-${SLUG}"
mkdir -p "$PRD_DIR"
```

Write `${PRD_DIR}/PRD.md`:

```markdown
---
status: draft
target_milestone: TBD
last_reviewed: {DATE}
---

# PRD: {Title}

## Problem
{what's broken/missing, for whom}

## Users & Jobs
{who, and what they're trying to do}

## Scope
{what v1 delivers}

## Non-Goals
{what is explicitly OUT — the most important section}

## Success Criteria
- {observable, testable criterion — EARS-style where it fits}

## Constraints & Dependencies
{tech, data, compliance, timeline, upstream/downstream}

## Open Questions
{anything still unresolved — must be empty or acknowledged before approval}
```
</step>

<step name="self_review">
Self-review the draft. Always sanity-check coverage. **Threshold-triggered lenses**
(apply only when the PRD is large, or touches a high-risk surface, or has product
ambiguity) — as a short checklist, **no new artifact, no multi-round gate** (see
`references/stolen-parts.md` §9):

- **Red Team** — how could this be misused, abused, or attacked? What's the worst
  input / adversarial user?
- **Risk** — what could go wrong operationally (data loss, rollout, dependencies)?
  What's the blast radius?
- **YAGNI** — what scope can be cut now? Which "requirements" are speculative?

Fold the findings back into the PRD (tighten Non-Goals, add Constraints/Open
Questions). Do not spawn agents or create side files.
</step>

<step name="visualize">
**Visual companion (capability-gated, degradable) — confirm the converged idea.**
Follow `references/brainstorm-visuals.md`. This is convergent: visuals depict the
*agreed* scope, never new ideas. Controlled by config `workflow.brainstorm_visual`
(`auto` default / `on` / `off`).

1. Under `auto`/`on`, embed a `## Visual Model` section in `PRD.md` with small Mermaid
   diagrams (architecture graph + the one primary flow). This is the portable degraded
   tier — always available.
2. Probe the runtime (per `brainstorm-visuals.md`). If it can preview rich content
   (or `brainstorm_visual: on`), also write a self-contained wireframe
   `${PRD_DIR}/MOCKUP.html` (low-fi, inline styles, no network) for the key surfaces.
   If it cannot, emit a one-line notice and stay at Mermaid.
3. Under `off`, skip visuals entirely (text PRD only).

Never hard-fail here and never let a missing/failed visual block the gate. If a
mockup reveals a scope gap, fold it back into the PRD (Scope / Non-Goals / Open
Questions) — do not expand scope in the picture.
</step>

<step name="gate">
**HARD GATE — stop at the PRD.** Present a short summary and the path (and any visual
artifacts written), and tell the user this is where clarification ends:

```
PRD drafted: {PRD_DIR}/PRD.md  (status: draft)
Visuals: {PRD_DIR}/MOCKUP.html + in-PRD Mermaid  (or "Mermaid only — runtime can't preview", or "skipped")

Review it, then when it's right, mark `status: approved` and set `target_milestone`.
Feed it to planning:
  /gsd-new-milestone --prd {PRD_DIR}/PRD.md     (or /gsd-new-project, /gsd-plan-phase --prd)
```

Do NOT auto-invoke new-milestone/new-project/plan-phase. Do NOT start building.
Approval is the user's action.
</step>

</process>

<success_criteria>
- [ ] Convergent only (idea → PRD); no divergent ideation, no external skill dependency
- [ ] Targeted questions cover problem / users / scope+non-goals / success / constraints
- [ ] PRD written to `prds/YYYY-MM-DD-<topic>/PRD.md` with `status`/`target_milestone`/`last_reviewed` frontmatter
- [ ] Self-review applies Red Team / risk / YAGNI lenses (threshold-triggered, checklist only, no new artifact)
- [ ] Visual companion (capability-gated per `references/brainstorm-visuals.md`): Mermaid in PRD under `auto`/`on`, `MOCKUP.html` only when the runtime can preview, degrades cleanly and never blocks the gate
- [ ] HARD GATE at the PRD — no downstream workflow auto-invoked; approval is the user's
</success_criteria>
