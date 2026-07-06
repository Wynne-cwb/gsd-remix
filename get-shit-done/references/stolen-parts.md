# Stolen Parts — local specification anchors

Per design D2 ("只偷零件,不换承包商") the final-form router/lanes borrow **text
conventions, interaction discipline, and prompt snippets** from external
frameworks — never their files, state models, or contractors. This document is
the **local, canonical spec** for each borrowed part.

**Rule (Fable5 R2 L2):** implementation references *this file*, not the external
originals. Do **not** WebFetch the source frameworks during implementation to
"expand scope" — if a part needs to grow, edit the spec here first and note why.
Each part below is self-contained: source (attribution only), what it is, the
1–3 line local rule to inject, and its landing point in GSD.

See `.plans/gsd-final-form-design.md` → "零件落点对照表" for the summary table.

---

## 1. One-sentence-diff → skip planning
- **Source:** Anthropic dev guidance (attribution).
- **What:** If the change is describable as a single sentence with no new
  decision and no high-risk surface, don't spin up planning ceremony.
- **Local rule:** Router size-axis treats "one-sentence diff + no decision + no
  hard risk" as the LIGHT signal. LIGHT lane does the edit inline.
- **Lands in:** router (`gsd-do` judgment layer) + LIGHT lane (`fast.md`).

## 2. Build the pass/fail signal before writing code
- **Source:** common engineering discipline (attribution).
- **What:** Establish how you'll know it works (a runnable check) before/while
  implementing, not after.
- **Local rule:** Executors (LIGHT + MEDIUM) must produce runnable verification
  evidence for each change; "it looks done" is not evidence.
- **Lands in:** `gsd-executor` prompt (LIGHT reproduce-then-resolve; MEDIUM
  `--validate-lite` evidence).

## 3. EARS acceptance phrasing
- **Source:** Kiro (attribution).
- **What:** EARS = Easy Approach to Requirements Syntax — constrained natural
  language that makes acceptance criteria testable.
- **Local rule (the 5 templates):**
  - Ubiquitous: `The <system> shall <response>.`
  - Event-driven: `When <trigger>, the <system> shall <response>.`
  - State-driven: `While <state>, the <system> shall <response>.`
  - Unwanted: `If <unwanted condition>, then the <system> shall <response>.`
  - Optional: `Where <feature included>, the <system> shall <response>.`
  Use one clause per criterion; each must map to a runnable/observable check.
- **Lands in:** MEDIUM planner — `acceptance` field phrasing (prompt hint, **not**
  a gate).

## 4. RED-GREEN double confirmation
- **Source:** superpowers (attribution).
- **What:** For work with a test seam: see the check fail for the expected
  reason (RED), implement, then see it pass with clean output (GREEN).
- **Local rule:** MEDIUM executor, when a test seam exists: run the check first,
  confirm it fails for the *right* reason, implement, re-run, confirm green
  **and** that output is clean (no swallowed errors/warnings). Applied as a
  gradient (see design "验证梯度"), not a universal gate.
- **Lands in:** `gsd-executor` prompt (MEDIUM).

## 5. Harper step-sizing heuristic
- **Source:** Harper (attribution).
- **What:** Break work into steps small enough that each is independently
  verifiable and reviewable; a step that can't state its own done-check is too big.
- **Local rule:** Planner prompt hint — prefer steps where each task carries its
  own `verify`/`done`; split any task whose verification spans multiple unrelated
  concerns.
- **Lands in:** `plan-phase` planner prompt.

## 6. Multi-lens architecture selection (conditional)
- **Source:** feature-dev (attribution).
- **What:** For genuinely new architecture, generate 2–3 contrasting approaches
  and recommend one, rather than committing to the first idea.
- **Local rule:** HEAVY planner, **only when** it detects new architecture / new
  dependency / new data model: present `minimal` vs `clean` vs `pragmatic` with
  trade-offs + a recommendation → user picks. A locally-high-risk but otherwise
  ordinary phase does **not** trigger this.
- **Lands in:** `plan-phase.md` (HEAVY).

## 7. Impact-weighted findings
- **Source:** feature-dev, improved (attribution).
- **What:** Rank review findings by impact, not by a confidence number.
- **Local rule:** Replaces the old `confidence ≥ 80` hard gate. A finding that is
  `low confidence + high impact` is **never filtered out** — it routes to "Needs
  human review". `confidence` only affects ordering.
- **Lands in:** `gsd-code-reviewer` + REVIEW.md schema.

## 8. Two-axis structured review
- **Source:** superpowers / Matt Pocock (attribution).
- **What:** Review along two explicit axes — Spec (does it meet requirements)
  and Standards (is it good code) — with a single structured report.
- **Local rule:** One reviewer emits **two conclusions** (Spec section +
  Standards section) into **one** REVIEW.md (preserves `code-review-fix`'s
  single-report contract). Name it honestly: "two-axis structured review" — it
  is **not** blind review. True blind review (two temp outputs + synthesis) is
  `--deep-review` opt-in only.
- **Lands in:** `code-review.md` + `gsd-code-reviewer` + REVIEW.md.

## 9. Sectioned adversarial self-review lenses
- **Source:** BMAD (attribution — technique only; no BMAD files/personas).
- **What:** Before finalizing a requirements doc, self-review through a few
  adversarial lenses.
- **Local rule:** The gsd-remix native clarification command's self-review step
  adds three **checklist bullets** — Red Team (how could this be attacked/abused),
  Risk identification (what could go wrong), YAGNI (what scope can be cut).
  Threshold-triggered (large PRD, or high-risk / product ambiguity present).
  **No** new artifact, **no** multi-round interactive gate.
- **Lands in:** `get-shit-done/workflows/brainstorm.md` self-review step (the native
  `/gsd-brainstorm` clarification command, D4).

---

**Anchoring status:** all 9 parts specified locally. When implementing any part,
cite the section number here in the commit/PR rather than an external URL.
