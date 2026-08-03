# Project Tenase — Documentation

Entry point for the `docs/` folder. These documents exist so that an AI agent or a
developer can get productive on this repository without reading all 55 source files.

> **Language note.** These documents are written in English. The source code itself is
> commented in Korean and the shipped UI is Korean; only identifiers, entity names and
> reaction ids are English. That split is intentional — see
> [conventions.md](conventions.md#language-policy).

---

## What this project is, in three sentences

Project Tenase is a client-only, single-page Next.js application that integrates a small
abstract reaction network and draws the result as a stylized 3D scene plus five signal
charts. The node names are borrowed from coagulation vocabulary but are used purely as
**labels on a directed graph** — nothing here is calibrated, validated, or biologically
accurate, and every quantity is a dimensionless 0.0–1.0 parameter. It has no backend, no
storage, and makes no network requests at runtime; these promises are enforced by a test
that scans the source tree.

Read [overview.md](overview.md) first if you want the full framing.

---

## Document map

| Document | Covers | Read it when |
|---|---|---|
| [overview.md](overview.md) | Scope boundary, tech stack, commands, repo layout | You are new to the repo |
| [architecture.md](architecture.md) | Layers, data flow, the two-clock model, module map | You need to know where code lives and why |
| [simulation-engine.md](simulation-engine.md) | Entities, reaction graph, integration math, derived signals, determinism | You are touching anything under `src/simulation/` |
| [state-management.md](state-management.md) | Zustand store, actions, validation policy, presets, timeline scrubbing | You are wiring UI to state |
| [ui-layer.md](ui-layer.md) | DOM components: dashboard, controls, charts | You are changing the 2D interface |
| [rendering-3d.md](rendering-3d.md) | React Three Fiber scene, per-frame budget, WebGL policy | You are changing anything under `src/components/three/` |
| [accessibility.md](accessibility.md) | Text mirror, redundant encoding, keyboard layer, reduced motion | You are changing anything user-facing |
| [testing.md](testing.md) | Vitest setup, what each suite guards, the policy scanner | You are adding tests or a test failed |
| [conventions.md](conventions.md) | Hard invariants, forbidden APIs, forbidden vocabulary, how to add an entity/reaction/preset | **Before you write any code** |

---

## Suggested reading paths

**"I have five minutes."**
[overview.md](overview.md) → the module map in [architecture.md](architecture.md#module-map).

**"I am an agent about to modify this repo."**
[conventions.md](conventions.md) first — it lists the constraints that will fail CI if you
break them, including a vocabulary ban that applies to comments as well as code. Then read
the document matching the layer you are touching.

**"I want to understand the model."**
[simulation-engine.md](simulation-engine.md) end to end. It is self-contained.

**"Something is failing and I do not know why."**
[testing.md](testing.md) — in particular the policy scanner section, which is the most
common source of surprising failures.

---

## Quick facts

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 6 |
| Routes | Exactly one: `/` |
| Backend | None. No API routes, no server actions, no data fetching |
| 3D | React Three Fiber 9 + three 0.185, with a DOM-only fallback |
| Charts | Recharts 3 |
| State | Zustand 5 (vanilla store + React binding), memory only |
| Styling | Tailwind CSS v4, CSS-first config in `src/app/globals.css` |
| Tests | Vitest 4 — 215 tests across 12 files, all passing |
| Graph size | 13 entities, 7 reactions, 7 scenario presets |
| Hard caps | 400 particle instances, 600 snapshots, 64 events |
| Persistence | None — no storage, cookies, IndexedDB, or query-string state |

Written against the working tree on **2026-08-03, ~17:10**: `tsc --noEmit` clean, `vitest run`
reports 215/215 passing across 12 files.

> The repository was under active development while these documents were written. Hover and
> reaction-trace highlighting, a scrubbing-aware frame context, a vessel-current renderer, and
> an entire `src/molecules/` structure-provider subsystem all landed during that window, and
> the `ScopeNotice` banner was removed. Treat `src/components/three/` and `src/molecules/` as
> the sections most likely to have moved on; the simulation, store, and testing documents
> describe the more settled parts of the codebase. `src/molecules/` is new enough that it is
> not yet covered here.
