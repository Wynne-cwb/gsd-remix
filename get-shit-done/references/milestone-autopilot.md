# Milestone Autopilot (roadmap → autonomous Team Lead handoff)

After `/gsd-new-project` or `/gsd-new-milestone` finishes building and approving a
ROADMAP, the milestone can hand straight off to `/gsd-autonomous` so the **Team Lead**
orchestrates the whole milestone (Decision Harvest → fresh teammate per bounded step
→ deferred UAT). This is **capability-gated** and, by default, **confirmed once** at
the roadmap boundary — not a blind build.

This file is the **self-contained** spec — gsd-remix ships it. Both `new-project.md`
and `new-milestone.md` follow it at their completion point, right after the roadmap is
approved and committed and **before** their normal "next step" messaging.

---

## Config

`workflow.auto_milestone: ask | auto | off` — **default `ask`**.

| value          | when team-capable (see gate)                                   |
|----------------|----------------------------------------------------------------|
| `ask` (default)| confirm **once** ("kick off the autonomous team run now?"), then hand off on yes |
| `auto`         | hand off seamlessly, no confirm                                |
| `off`          | never hand off — fall through to the normal next-step messaging |

Regardless of value, if the capability gate fails the workflow falls back to its
normal next-step messaging (the current stop-and-guide behavior).

---

## Capability gate (run first)

The handoff targets the **Team Lead** flow specifically, so it requires that team
mode would actually engage. Run the **same** two-tier check as
`references/team-mode.md` (§ *Capability gate + probe*):

1. **Coarse — runtime + config.** Runtime identity must be Claude Code (`Agent` tool
   available) **and** `workflow.team_mode` must not be `off`. Read them:
   ```bash
   TEAM_MODE=$(gsd-remix-sdk query config-get workflow.team_mode 2>/dev/null || echo "auto")
   AUTO_MILESTONE=$(gsd-remix-sdk query config-get workflow.auto_milestone 2>/dev/null || echo "ask")
   RUNTIME=$(gsd-remix-sdk query runtime.health 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).runtime_identity?.runtime||'')}catch{console.log('')}})")
   ```
2. **Fine — deterministic no-op Agent probe.** Spawn one trivial Agent that must
   return a fixed token (e.g. `Agent(prompt="reply with exactly: TEAM_OK")`).

**If `AUTO_MILESTONE` is `off`, or `TEAM_MODE` is `off`, or the coarse/fine gate
fails → do NOT hand off.** Fall through to the workflow's normal next-step messaging.
Do not print an error; this is the expected fallback on non-Claude runtimes or when
the user opted out.

---

## Handoff (only when the gate passes and `auto_milestone != off`)

1. **Confirm (if `auto_milestone: ask`).** Interactive only — one `AskUserQuestion`:
   > "Roadmap ready — {N} phases. Kick off the autonomous team run now? The Team Lead
   > front-loads every decision (Decision Harvest), then builds unattended."
   - **Yes, run it (Team Lead)** → proceed to step 2.
   - **No, I'll drive it** → fall through to the normal next-step messaging.

   `auto_milestone: auto` skips the confirm. **Headless / `--auto` / TEXT_MODE with no
   interactive channel** also skips the confirm (treat as proceed — the run is
   unattended by definition; `/gsd-autonomous --auto` then harvests any decisions).

2. **Hand off.** The autonomous run becomes the **sole** milestone driver — clear the
   per-phase auto-advance chain so the two mechanisms don't double-drive phases:
   ```bash
   gsd-remix-sdk query config-set workflow._auto_chain_active false
   ```
   Then exit the current skill and invoke:
   ```
   SlashCommand("/gsd-autonomous --auto")
   ```
   `--auto` means **after-harvest unattended**: `/gsd-autonomous` re-runs its own team
   gate (§2.5), performs the Decision Harvest interactively, then builds the whole
   milestone unattended. Do **not** also run the workflow's normal next-step block
   after handing off.

---

## Guarantees

- **Never on a non-Claude runtime, and never when `team_mode: off`** — those fall
  through to stop-and-guide.
- **`ask` is the default** — the roadmap stays a real human checkpoint; the handoff is
  one confirmation, not a silent takeover.
- **No double-driving** — the yolo per-phase auto-advance chain
  (`_auto_chain_active`) is cleared before the autonomous run takes over.
