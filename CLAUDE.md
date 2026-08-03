# Project Tenase — working conventions

Operative rules for anyone (human or agent) writing code in this repository.
Full detail lives in [`docs/`](docs/README.md); start with
[`docs/conventions.md`](docs/conventions.md).

---

## Comments are written in Korean

**All code comments — line comments, block comments, JSDoc, and JSX comments — are written in
Korean.** This is the house style throughout `src/`, and new code must match it.

```ts
/** 향후 공급자 연동 경계. 식별자는 확인을 거친 뒤에만 쓴다. */
```

```ts
/** Future provider boundary. Identifiers must be curated before use. */
```

What stays in English:

- **Identifiers** — variable, function, type, and component names.
- **Entity names, reaction ids, and short codes** (`factorIXa`, `r3-conversion`, `TEN`) —
  they are stable identifiers in the abstract graph.
- **The `docs/` folder**, which is written in English by request.

Everything the reader sees is Korean: comments, docstrings, and all UI copy
(`<html lang="ko">`).

A comment should record a constraint the code cannot express on its own — why a constant was
chosen, what invariant is being protected — not restate what the next line does.

---

## Constraints that fail the build

These are enforced mechanically by `src/tests/policy.test.ts`, which scans `src/`.
See [`docs/conventions.md`](docs/conventions.md#hard-constraints) for the complete lists.

1. **No storage, network, or query-string APIs.** No `localStorage`, `sessionStorage`,
   cookies, `IndexedDB`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
   `sendBeacon`, `URLSearchParams`, or `useSearchParams`. No `dangerouslySetInnerHTML`.
2. **No absolute URLs anywhere under `src/`** — the rule scans raw text, so a link inside a
   comment fails too.
3. **Forbidden vocabulary, comments included.** Twenty case-insensitive patterns covering
   ordinary programming English such as `success`, `failure`, `safe`, `risk`, `treat*`,
   `patient`, `clinical`, `mg`, and `IU`. The only exception is `non-clinical`. Negation does
   not exempt you. Prefer the project's neutral vocabulary: *network activity*,
   *activation intensity*, *abstract role*, *handled*, *edge*, *node*, *turnover*.
4. **Every user-facing quantity is dimensionless on a 0–1 scale**, validated through
   `src/simulation/numeric.ts`. `time` counts abstract model time units, never real seconds.
5. **`src/simulation/` stays pure and deterministic** — no React, DOM, three.js, I/O, or
   randomness. Use `createSeededRandom` for scene scatter, never `Math.random()`.
6. **The render loop allocates nothing.** Hoist scratch objects to module scope; never retain
   the frame context or the engine's `levels` record.

## Before finishing

```bash
npm run verify
```

Runs lint → typecheck → test → build.
