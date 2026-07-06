<purpose>
Escalate work that outgrew its lane into a heavier lane, carrying context, decisions,
and already-committed code forward as **evidence** — the payoff of Route B (升档不跨
工具边界). v1 is strictly **quick → heavy**; it does NOT do medium↔heavy or arbitrary
phase relocation (kept narrow on purpose). It NEVER reverts committed code.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse">
Parse `$ARGUMENTS`:
- First non-flag token → the quick task id / slug fragment / dir (e.g. `250706-abc`).
- `--from-fast` → downgrade mode (a `/gsd-fast` LIGHT change that should have been heavier). See `fast_downgrade`.
- `--why "<reason>"` → the escalation reason (drives evidence_status). If absent, ask.

If no task reference and not `--from-fast`:
```
Usage: /gsd-escalate <quick-task-id> [--why "reason"]
       /gsd-escalate --from-fast "<what you just did with /gsd-fast>"
```
Exit.
</step>

<step name="choose_evidence">
**Judgment step (quick → heavy).** Decide how the prior quick-task work should be
treated, from the escalation reason. Map the reason to one `evidence_status`:

- `accepted_prior_work` — the quick work is correct; it just needs the fuller
  heavy treatment (more phases/validation). Planner builds on top.
- `suspect_prior_work` — the reason implies the quick implementation may be wrong
  (bug found, wrong approach). Planner MUST re-review it, not normalize it.
- `revert_recommended` — the quick work is misdirected; a revert is likely.

If `--why` was not given, ask the user (AskUserQuestion; text mode → numbered list)
which of the three best matches. Do not guess silently when the signal is ambiguous.
</step>

<step name="migrate">
Run the deterministic migration (creates the phase, seeds CONTEXT from the quick
task's context + plan + commits, updates STATE Current Phase):

```bash
RESULT=$(gsd-remix-sdk query route.escalate "<quick-task-id>" --evidence "<evidence_status>")
```

Parse: `phase_number`, `phase_dir`, `context_path`, `evidence_status`,
`revert_recommended`, `prior_commits`, `routed_to` (always `plan`).

The seeded phase has CONTEXT but **no PLAN** on purpose — `/gsd-next` will route it
to `/gsd-plan-phase`, so the work is re-planned at heavy fidelity while inheriting
the prior context and commits as evidence. **Committed code is untouched.**
</step>

<step name="commit_and_report">
Commit the migration artifacts (if `commit_docs` is enabled):

```bash
gsd-remix-sdk query commit "docs(${padded}): escalate quick task to heavy phase (evidence: ${evidence_status})" \
  --files "${context_path}" .planning/ROADMAP.md .planning/STATE.md
```

Report:
```
Escalated to Phase {phase_number} (evidence: {evidence_status}).
Prior commits preserved as evidence: {count}.
```

**If `revert_recommended` is true:** surface, do NOT act automatically:
```
⚠ The prior quick work looks misdirected. Consider reverting BEFORE planning:
  /gsd-undo            — roll back the quick task's commits
Then plan the heavy phase fresh. (This workflow never reverts committed code.)
```

Next step:
```
/gsd-plan-phase {phase_number}
```
</step>

<step name="fast_downgrade">
**Only when `--from-fast`.** A LIGHT change that should have been heavier. v1 does
**not** auto-migrate a fast change into a phase — it produces an **evidence packet**
and hands off:

1. Gather: the task description, the commit hash(es) just made, and any decisions taken.
2. Emit the packet inline:
   ```
   Evidence packet (from /gsd-fast):
   - What: {task description}
   - Commits: {hashes}
   - Decisions: {any}
   ```
3. Recommend reopening in a heavier lane, passing the packet as the description:
   ```
   Reopen heavier (recommended):
     /gsd-do "{task}"        — router picks the right lane, or
     /gsd-quick "{task}"
   ```

Do not create a phase or mutate STATE in downgrade mode. Stop after the handoff.
</step>

</process>

<success_criteria>
- [ ] v1 restricted to quick → heavy (no medium↔heavy, no arbitrary phase relocation)
- [ ] evidence_status chosen (accepted / suspect / revert-recommended) from the reason
- [ ] route.escalate seeds a phase with CONTEXT and NO PLAN (routes to plan, not verify)
- [ ] STATE Current Phase updated to the seeded phase
- [ ] Committed code never reverted; revert only surfaced as a `/gsd-undo` suggestion
- [ ] --from-fast produces an evidence packet + handoff only (no auto-migration)
</success_criteria>
