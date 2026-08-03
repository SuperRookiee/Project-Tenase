# Conventions and invariants

**Read this before writing code in this repository.** Most of what follows is enforced
mechanically, so violating it fails `npm run verify` rather than merely being frowned upon.

---

## Hard constraints

These will break the build if you get them wrong.

### 1. No storage, no network, no query-string state

The following must not appear anywhere under `src/`:

`localStorage` · `sessionStorage` · `document.cookie` · `cookieStore` · `indexedDB` ·
`XMLHttpRequest` · `sendBeacon` · `new WebSocket` · `EventSource` · bare `fetch(` ·
`window|globalThis|self .fetch(` · `useSearchParams` · `URLSearchParams` · `location.search` ·
`dangerouslySetInnerHTML` · any `http(s)://` URL

The URL rule scans **raw text**, so a link inside a comment fails, as does an SVG XML
namespace string. Everything must be local.

All state lives in memory for the lifetime of the page. A refresh starts a fresh run — this
is a designed property, not an oversight.

### 2. Forbidden vocabulary — including in comments

`src/tests/policy.test.ts` scans **raw source text under `src/`, comments included**, and
fails on these twenty case-insensitive patterns:

> `success(es|ful|fully)`, `failure(s)`, `safe(ly|ty|r|st)`, `unsafe(ly)`,
> `risk(s|y|ier|iest)`, `therapeutic(s)`, `dose`/`doses`/`dosed`/`dosing`, `dosage(s)`,
> `patient(s)`, `clinical(ly)`, `diagnos*`, `treat*`, `therapy`/`therapies`, `disease(s)`,
> `bleeding`, `thrombosis`/`thromboses`, `hemophilia*`, `anticoagul*`, `mg`, `IU`

The **only** exception is the hyphenated compound `non-clinical`. Negation does not exempt
you: "no risk" and "not unsafe" both still fail, and there are tests proving it.

This catches ordinary programming English. `treat*` matches "treated" and "treatment";
`failure(s)` matches "failure mode"; `safe` matches "type-safe" and "safely"; `mg` and `IU`
match as standalone words. Reach for the neutral vocabulary the codebase already uses:
*network activity*, *activation intensity*, *abstract role*, *handled*, *rejected*,
*edge*, *node*, *turnover*.

> This `docs/` folder sits outside the scan root (`<repo>/src`), which is why this document
> can quote the list. Do not paste these words into source files.

### 3. Everything user-facing is dimensionless 0–1

No units, concentrations, masses, half-lives, or thresholds. `time` counts **abstract model
time units**, never real seconds. The single exception is `reactionEventCount`, an
unnormalized integer.

All validation goes through [`src/simulation/numeric.ts`](../src/simulation/numeric.ts) —
do not hand-roll clamping:

| Situation | Use |
|---|---|
| Untrusted UI input | `parseNormalized` → returns `null`, caller ignores it silently |
| Engine boundary | `assertNormalized(value, label)` → throws `RangeError` |
| Internal arithmetic | `clamp01` → throws on `NaN`/`Infinity` rather than coercing |
| Display | `formatNormalized`, `formatPercentOfScale` |

### 4. The engine stays deterministic and pure

`src/simulation/` must not import React, DOM, or three.js, must perform no I/O, and must
contain **no randomness**. The same config and step sequence must always produce identical
state, including identical event id strings.

Where the *scene* needs scattered positions, use `createSeededRandom` from
[`sceneLayout.ts`](../src/components/three/sceneLayout.ts) — never `Math.random()`.

### 5. The render loop allocates nothing

In any `useEngineFrame` callback:

- Hoist scratch `THREE.Object3D` / `Vector3` / `Quaternion` instances to module scope.
- Allocate instanced meshes once at capacity; change only `.count` at runtime.
- Precompute layouts into a flat `Float32Array` inside `useMemo`, with a documented stride.
- Never retain the frame context or `ctx.levels` — the context is reused and the engine
  mutates `levels` in place. Copy if you need to keep a value.

### 6. Never advance the engine from the scene

`useEngineFrame` reads only. The clock in `AppShell` is the sole writer. A second writer
would race the first and destroy determinism.

### 7. Meaning never rides on color alone

Any surface showing an entity's color must also show its `glyph` or `shortCode`. Any visual
distinction in the 3D scene needs a non-color carrier — geometry, an outline, a tick mark.
There is a DOM test asserting this for `NormalizedSlider`.

---

## Language policy

### Comments are written in Korean

**Every code comment is Korean** — line comments, block comments, JSDoc, and JSX comments
alike. This holds throughout `src/`, and new code must match it.

```ts
/** 향후 공급자 연동 경계. 식별자는 확인을 거친 뒤에만 쓴다. */
```

```ts
/** Future provider boundary. Identifiers must be curated before use. */
```

Unlike the constraints above, this one is **not enforced by a test** — nothing scans for
comment language. It is a review-time convention, which makes it the easiest rule in this
document to erode, particularly in generated code. The `src/molecules/adapters/` files landed
with English docblocks on 2026-08-03 and had to be converted by hand.

### What stays in English

- **Identifiers** — variable, function, type, and component names.
- **Entity names, reaction ids, and short codes** (`factorIXa`, `r3-conversion`, `TEN`).
  They are stable identifiers in the abstract graph.
- **This `docs/` folder**, by request. It also sits outside the policy scan.

Everything the reader sees is Korean: comments, docstrings, and all UI copy
(`<html lang="ko">`).

### What a comment is for

Match the surrounding Korean, and keep the comment to constraints the code cannot express on
its own — why a constant was chosen, what invariant is being protected. Never restate what
the next line does. The existing docblocks are the model: several exist specifically to record
a decision that would otherwise look arbitrary, such as why `inhibitionModelSignal` is a ratio
rather than a throughput, or why the `relative` class on each layout region is load-bearing.

## Code style

- TypeScript is strict, plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`,
  and `noFallthroughCasesInSwitch`. Prefix intentionally unused bindings with `_`.
- `readonly` on interface fields and `readonly T[]` for arrays is the prevailing style in the
  model layer.
- Import from `@/…` (aliased to `src/`), not deep relative paths — except within a directory,
  where `./Sibling` is used.
- Data-driven over hard-coded: entities, reactions, and presets are arrays of definitions,
  and the UI derives from them. Adding a node should not require touching a switch statement.
- Named exports throughout. The only default exports are the Next.js route conventions
  (`layout.tsx`, `page.tsx`) and `next.config.ts`.
- Components are function declarations, not arrow constants.

---

## How to make common changes

### Add an entity

1. Add the id to the `EntityId` union in [`types.ts`](../src/simulation/types.ts).
2. Add a full definition to `ENTITY_DEFINITIONS` in
   [`entities.ts`](../src/simulation/entities.ts) — including `glyph` and `shortCode`, which
   are not optional in practice because of the color rule.
3. Add a zone to `ENTITY_ZONES` in
   [`sceneLayout.ts`](../src/components/three/sceneLayout.ts). This record is typed as
   `Record<EntityId, EntityZone>`, so `tsc` will fail until you do.
4. If `renderAsParticles: true`, the particle budget redistributes automatically by
   `particleWeight` — check that `particles.test.ts` still passes. If `false`, the node needs
   its own renderer.
5. `createLevels`, `createDefaultSupply`, and `createDefaultFlags` pick it up automatically.

### Add a reaction

1. Append a definition to `REACTION_DEFINITIONS` in
   [`reactions.ts`](../src/simulation/reactions.ts).
2. Add a site to `REACTION_SITES` in `sceneLayout.ts` so its pulse has somewhere to render.
3. Optionally add entries to `FLOW_LINKS` in
   [`FlowGuides.tsx`](../src/components/three/FlowGuides.tsx).
4. `GRAPH_EDGES`, the text mirror, and the WebGL fallback all derive from the definition and
   need no changes.
5. If the reaction is an `inhibition`, re-run `inhibition.test.ts` — `INHIBITION_TARGETS` is
   derived at module load and the share calculation will change.

### Add a scenario preset

1. Add the id to the `PresetId` union and a definition to `SCENARIO_PRESETS` in
   [`scenarios.ts`](../src/presets/scenarios.ts), with non-empty `name`, `description`, and
   `focus`.
2. Add the id to `EVERY_PRESET_ID` in [`presets.test.ts`](../src/tests/presets.test.ts) —
   that object is typed `Record<PresetId, true>`, so the completeness check is a compile
   error until you do. This is intentional.
3. Keep `description` and `focus` descriptive, never predictive, and clear of the banned
   vocabulary — `presets.test.ts` checks those strings directly.

### Add a keyboard shortcut

Update both [`useKeyboardControls.ts`](../src/hooks/useKeyboardControls.ts) **and**
[`KeyboardHelp.tsx`](../src/components/dashboard/KeyboardHelp.tsx); they are meant to stay in
sync. Respect the stand-down rules — modifier keys, text-entry targets, and `Space` on
activation targets. Every shortcut must have a visible control too; the keyboard is a
shortcut layer, never the only route.

### Add a chart series

Add an entry to `SERIES` in
[`SignalChartGrid.tsx`](../src/components/charts/SignalChartGrid.tsx) and map the signal in
`toRow`. Keep the y-domain at `[0, 1]` and include the entity glyph in the title.

---

## Before you finish

```bash
npm run verify
```

Then check:

- [ ] No banned vocabulary in new code **or comments**
- [ ] No storage, network, or query-string APIs; no absolute URLs
- [ ] New numeric parameters are 0–1 and go through `numeric.ts`
- [ ] No allocation inside a render-loop callback
- [ ] Any new color carries a glyph or short code alongside it
- [ ] Comments are Korean and explain a constraint, not the mechanics
- [ ] If you touched inhibition, `inhibition.test.ts` still passes
- [ ] If you touched the keyboard layer, `KeyboardHelp` was updated too
