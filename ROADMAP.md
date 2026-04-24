# Collaboration Roadmap

## 当前焦点

- Maintain `gsd-remix` as an unofficial, opinionated remix of upstream GSD while keeping command/file compatibility where practical.
- Continue improving GSD ergonomics around context size, runtime health, SDK repair, and long-lived task memory.
- Establish a root-level context handoff protocol so future sessions can resume without rereading the whole chat.

## 活跃问题

- No active blocker.
- If future discussion becomes too long for this file, create `handoff/<slug>.md` and keep only the active link here.

## 最近决策

- 2026-04-24: Project/package name is `gsd-remix`, with GitHub repo `Wynne-cwb/gsd-remix`, to signal an unofficial remix while retaining GSD compatibility.
- 2026-04-24: Publish a single npm package, `gsd-remix`; the SDK source is bundled and repaired by installer/runtime health instead of publishing a second package.
- 2026-04-24: Runtime health should help users confirm they are using GSD Remix rather than an upstream GSD leftover.
- 2026-04-24: GitHub/Git links in project files should point to `Wynne-cwb/gsd-remix`.
- 2026-04-24: Long-lived collaboration context uses root `ROADMAP.md` plus lazy `handoff/*.md`, with rules documented in `AGENTS.md`.

## 下次 session 继续点

- Start by reading this file, then `AGENTS.md` for the context protocol.
- No active handoff file is required right now.
- Recent published npm version: `gsd-remix@1.0.1`.
