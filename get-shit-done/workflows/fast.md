<purpose>
Execute a trivial task inline without subagent overhead. No PLAN.md, no Task spawning,
no research, no plan checking. Just: understand → do → commit → log.

For tasks like: fix a typo, update a config value, add a missing import, rename a
variable, commit uncommitted work, add a .gitignore entry, bump a version number.

Use /gsd-quick for anything that needs multi-step planning or research.
</purpose>

<process>

<step name="parse_task">
Parse `$ARGUMENTS` for the task description.

**--force-light flag:** If `$ARGUMENTS` contains `--force-light`, set `FORCE_LIGHT=true`
and strip it from the description. This is an explicit override for the high-risk
preflight (see `scope_check`) — the user takes responsibility for keeping a
high-risk change in the LIGHT lane.

```bash
FORCE_LIGHT=false
case " $ARGUMENTS " in *" --force-light "*) FORCE_LIGHT=true;; esac
```

If empty, ask:
```
What's the quick fix? (one sentence)
```

Store the remaining text as `$TASK`.
</step>

<step name="scope_check">
**Before doing anything, verify this is actually trivial.**

A task is trivial if it can be completed in:
- ≤ 3 file edits
- ≤ 1 minute of work
- No new dependencies or architecture changes
- No research needed

If the task seems non-trivial (multi-file refactor, new feature, needs research),
say:

```
This looks like it needs planning. Use /gsd-quick instead:
  /gsd-quick "{task description}"
```

And stop.

**High-risk preflight (escalation 铁律 — shared `route.risk-scan`).**

Even a one-line change is NOT eligible for the LIGHT lane if it touches a
high-risk surface (auth/session/token, payment/billing, migration/schema, public
API, webhook, tenant/org boundary, PII/logging, CORS/cookie/redirect, unsafe
HTML, BFF outbound). Infer the likely files from `$TASK` and run the **same**
scanner the router uses (one lexicon, no drift):

```bash
RISK=$(gsd-remix-sdk query route.risk-scan "$TASK" --paths "inferred/path1,inferred/path2" 2>/dev/null)
MAX_STRENGTH=$(printf '%s' "$RISK" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).max_strength||'none')}catch{console.log('none')}})" 2>/dev/null)
```

If `MAX_STRENGTH` is `hard` and `FORCE_LIGHT` is not true, **refuse the LIGHT lane**:

```
This change touches a high-risk surface ({hard surface, e.g. auth/session}).
High-risk work must go through a heavier lane so it gets planning + review:
  /gsd-do "{task}"          — let the router pick the right lane, or
  /gsd-quick "{task}"       — planned + validated
Override (you own the risk):  /gsd-fast "{task}" --force-light
```

And stop. A `soft`/`noise`/`none` result does not block LIGHT.

If `FORCE_LIGHT=true` while `MAX_STRENGTH=hard`, proceed but **record the reason**:
print a one-line warning and, in the commit body, note
`forced-light: high-risk ({surface}) kept in LIGHT lane by --force-light`.
</step>

<step name="execute_inline">
Do the work directly, with **reproduce-then-resolve** discipline:

1. Read the relevant file(s).
2. **Reproduce first (when there's an observable symptom):** before touching
   anything, run the failing test / command / repro once and capture the actual
   symptom (error text, wrong output). This confirms you're fixing the real thing.
3. Make the change(s).
4. **Confirm resolved:** re-run the same check and confirm the symptom is gone
   (and output is clean — no new errors). For a pure additive/no-symptom change
   (e.g. a version bump), run the nearest sanity check instead.
5. **Show the evidence in your reply** — the before (symptom) and after (clean)
   output, inline. No PLAN.md, no SUMMARY.md; the evidence lives in the response.

**No PLAN.md.** Just do it.
</step>

<step name="commit">
Commit the change atomically:

```bash
git add -A
git commit -m "fix: {concise description of what changed}"
```

Use conventional commit format: `fix:`, `feat:`, `docs:`, `chore:`, `refactor:` as appropriate.
</step>

<step name="log_to_state">
If `.planning/STATE.md` exists, append to the "Quick Tasks Completed" table.
If the table doesn't exist, skip this step silently.

```bash
# Check if STATE.md has quick tasks table
if grep -q "Quick Tasks Completed" .planning/STATE.md 2>/dev/null; then
  # Append entry — workflow handles the format
  echo "| $(date +%Y-%m-%d) | fast | $TASK | ✅ |" >> .planning/STATE.md
fi
```
</step>

<step name="done">
Report completion:

```
✅ Done: {what was changed}
   Commit: {short hash}
   Files: {list of changed files}
```

No next-step suggestions. No workflow routing. Just done.
</step>

</process>

<guardrails>
- NEVER spawn a Task/subagent — this runs inline
- NEVER create PLAN.md or SUMMARY.md files
- NEVER run research or plan-checking
- NEVER keep a high-risk (`hard`) change in LIGHT without an explicit `--force-light` + recorded reason
- If the task takes more than 3 file edits, STOP and redirect to /gsd-quick
- If you're unsure how to implement it, STOP and redirect to /gsd-quick
</guardrails>

<success_criteria>
- [ ] High-risk preflight run via route.risk-scan; `hard` refused (or `--force-light` + reason recorded)
- [ ] Symptom reproduced before the fix and confirmed gone after (evidence shown inline)
- [ ] Task completed in current context (no subagents)
- [ ] Atomic git commit with conventional message
- [ ] STATE.md updated if it exists
- [ ] Total operation under 2 minutes wall time
</success_criteria>
