# Brainstorm Visual Companion (capability-gated, convergent)

The visual companion for `/gsd-brainstorm`. It renders the **already-converged**
idea — never to ideate, always to *confirm* — as two artifacts:

1. **UI mockups / wireframes** — low-fidelity layout of what the user will see.
2. **Architecture / flow / sequence diagrams** — how the pieces fit and data moves.

This file is the **self-contained** spec — gsd-remix ships it; it depends on no
external skill and on no MCP server. `brainstorm.md` reads and follows this file only
when the visual gate passes. It stays **convergent**: visuals depict the agreed
scope; if a mockup exposes a scope gap, fold it back into the PRD (tighten Scope /
add an Open Question) — do **not** let the picture expand scope.

---

## Capability gate + probe (run before drawing anything, after the idea converges)

Controlled by config `workflow.brainstorm_visual: auto | on | off`.

**Shipped default is `auto`.** The degraded tier (Mermaid in the PRD) is portable
text and runs anywhere; the enhanced tier (a rendered wireframe) is gated on a
runtime that can actually preview it.

Coarse gate — runtime identity (same signal as `references/team-mode.md`):

```bash
RUNTIME=$(gsd-remix-sdk query runtime.health 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).runtime_identity||'')}catch{console.log('')}})")
```

A runtime that can render/preview rich content (e.g. Claude Code, with interactive
artifacts / a browser preview) supports the **enhanced tier**. Text-only runtimes
(OpenAI Codex, Gemini CLI, etc.) get the **degraded tier**.

Two tiers, one contract:

| `brainstorm_visual` | Degraded tier — Mermaid in PRD.md | Enhanced tier — `MOCKUP.html` |
|---------------------|-----------------------------------|-------------------------------|
| `off`               | skip — text PRD only              | skip                          |
| `auto` (default)    | **always** embed Mermaid          | write it **only when the runtime can preview**; otherwise emit a one-line notice and stay at Mermaid |
| `on`                | always embed Mermaid              | **always** write it (note it may need to be opened manually on a text-only runtime) |

**Never hard-fail and never block the HARD GATE on visuals.** A missing capability
degrades to Mermaid-only with a one-line notice; a failed render degrades the same
way. The PRD gate proceeds regardless — visuals are a confirmation aid, not a
prerequisite.

---

## Degraded tier — Mermaid inside PRD.md (portable, always-on under `auto`/`on`)

Add a `## Visual Model` section to `PRD.md` with, at minimum:

- **Architecture** — a `mermaid` `graph`/`flowchart` of the main components and how
  the change slots in (new nodes marked).
- **Primary flow** — a `mermaid` `sequenceDiagram` or `flowchart` of the one core
  user/data path the PRD delivers.

Keep them small — the load-bearing path, not an exhaustive map. Mermaid renders in
GitHub, VS Code, and most markdown viewers, so this tier needs no extra capability.

---

## Enhanced tier — `MOCKUP.html` (gated)

When the gate passes, write ONE self-contained file `${PRD_DIR}/MOCKUP.html`:

- **Self-contained:** inline `<style>` only, no external network requests, no CDN,
  no fonts/scripts fetched at load. Opens correctly from `file://`.
- **Wireframe fidelity:** low-fi — greyscale boxes, placeholder labels, dashed
  regions with annotations. No real branding, no invented data, no pixel-perfect
  chrome. The goal is "does this layout match what we agreed", not visual design.
- **One screen per key surface** the PRD introduces (list/detail/form/empty/error as
  relevant), each with a short caption tying it to a Success Criterion.
- Reference the PRD title and date at the top so the file is self-describing.

After writing it, tell the user the path and, on a preview-capable runtime, offer to
open/preview it. Record the artifact in the PRD gate summary.

---

## Convergent discipline (the guardrail)

- Visuals illustrate the **converged** scope only. They are not a divergent canvas.
- If drawing surfaces something undecided, that is a **PRD** change (Scope / Non-Goals
  / Open Questions), not a new feature drawn into the mockup.
- Do not spawn agents and do not create side artifacts beyond `MOCKUP.html` and the
  in-PRD Mermaid. No multi-round visual review loop.
