# Testing

```bash
npm test
```

```bash
npm run verify
```

`verify` runs lint → typecheck → test → build in sequence. As of the last verification run:
ESLint clean, `tsc --noEmit` clean, **207 tests across 11 files passing**, and the production
build succeeds with `/` prerendered as static content.

---

## Vitest configuration

[`vitest.config.ts`](../vitest.config.ts) defines **two projects**:

| | `simulation` | `ui` |
|---|---|---|
| Environment | `node` | `jsdom` |
| Include | `src/tests/**/*.test.ts` | `src/tests/**/*.dom.test.tsx` |
| Setup | none | `src/tests/setup/dom.setup.ts` |
| Plugins | none | `@vitejs/plugin-react` |
| Alias | `@` → `src` | `@` → `src` |

`globals: true` in both. There is no coverage configuration and no custom pool settings.

Note the glob consequence: a `.tsx` test is only picked up if it matches `*.dom.test.tsx`.
A file named `foo.dom.test.ts` (no `x`) would land in the **node** project and get no DOM
setup.

### `dom.setup.ts`

Fills three jsdom gaps and registers `afterEach(cleanup)`:

| Polyfill | Why |
|---|---|
| `ResizeObserver` stub | Recharts measures container size with it. The stub deliberately **never invokes its callback** — these tests assert markup, not layout. |
| `window.matchMedia` | The reduced-motion hook reads it. Always returns `matches: false`, and provides both the modern `addEventListener` and legacy `addListener` surfaces so components can subscribe and unsubscribe without throwing. |
| `Element.prototype.scrollIntoView` | jsdom has no layout engine; list widgets call it. |

**There is no WebGL mock**, by design. The `ui` project only covers non-WebGL UI, and the
particle budget is tested as a pure function instead of through a WebGL smoke test.

---

## What each suite guards

| File | Focus |
|---|---|
| [`policy.test.ts`](../src/tests/policy.test.ts) | Repository-wide source scan. **Read the section below.** |
| [`engine.test.ts`](../src/tests/engine.test.ts) | Determinism, 0–1 bounds, damage gating, node disabling, input validation, `advance()` behavior |
| [`inhibition.test.ts`](../src/tests/inhibition.test.ts) | Monotonicity of the inhibition signals |
| [`store.test.ts`](../src/tests/store.test.ts) | Store actions, silent-rejection policy, scrubbing, reset semantics |
| [`scheduler.test.ts`](../src/tests/scheduler.test.ts) | Frame loop with a fully injected fake clock — no real timers |
| [`numeric.test.ts`](../src/tests/numeric.test.ts) | Exhaustive boundary coverage for the 0–1 guards |
| [`particles.test.ts`](../src/tests/particles.test.ts) | The 400-instance cap, including a seeded fuzz test |
| [`presets.test.ts`](../src/tests/presets.test.ts) | Preset registry completeness, purity, and vocabulary |
| [`snapshots.test.ts`](../src/tests/snapshots.test.ts) | Ring buffer semantics and index clamping |
| [`controls.dom.test.tsx`](../src/tests/controls.dom.test.tsx) | `NormalizedSlider` accessibility and input handling |
| [`dashboard.dom.test.tsx`](../src/tests/dashboard.dom.test.tsx) | Dashboard components against a shared store state |

### `engine.test.ts`

Uses a **seeded mulberry32 PRNG** so bound checks reproduce on any machine — the engine has
no randomness and neither does the suite.

- **Bounds sweep**: 60 runs × 400 steps with randomized supply, enabled flags, damage, speed,
  and density. Every level and every normalized signal must be finite and within `[0, 1]` at
  *every* tick.
- **Cascade ordering**: over 4000 steps, each downstream signal's first activation tick must
  be at or after its upstream's — activity propagates in graph order, never backwards.
- **Damage gating closed**: with `vesselDamageSignal: 0` and 3000 steps, all transient nodes
  are **exactly** 0, all normalized signals exactly 0, the event count is 0, and every entry
  in `reactionActivity` is 0.
- **Disabling is local**: switching off `factorVIIIa` zeroes `r2-binding` activity and
  collapses downstream signals, while `factorIX` still relaxes toward its setpoint.
- **Determinism**: two engines from one config, 1500 steps each, must match on levels,
  signals, and the full sequence of event ids. Reset determinism is checked separately.
- **Validation**: `NaN`/`±Infinity` throw `RangeError` and leave the config **byte-identical**
  (compared against a `structuredClone`), with no partial application. Out-of-range *finite*
  values clamp rather than throw.
- **`advance()`**: never runs more than `MAX_STEPS_PER_FRAME` steps per call; the tick delta
  equals the returned step count; non-finite and non-positive deltas are ignored.

It also asserts that `inhibitionModelSignal` is **not** close to `inhibitionIntensity`,
encoding that these are deliberately different quantities.

### `inhibition.test.ts`

Every comparison is a **paired run**: two engines from the same default config differing in
exactly one inhibitor supply value, stepped the same number of times. Since the engine is
deterministic, all divergence is attributable to that one parameter. `STEPS = 600` and an
8-rung ladder `[0, 0.15, …, 1]`.

The important part is the regression guard on `inhibitionModelSignal`: for
`steps ∈ {300, 600, 1200}` × `inhibitor ∈ {tfpi, antithrombin}`, the ladder series must be
non-decreasing *and* strictly greater at the last rung than the first. Its docblock records
the two earlier broken definitions this guards against:

1. **Absolute inhibitory flux**, which *fell* as TFPI rose, because starving the mid-network
   collapsed the pool the second inhibitory edge acted on.
2. **A whole-network ratio**, which spiked whenever the terminal structural node saturated
   out of the denominator.

If you change how inhibition is measured, this is the test that will catch you.

### `particles.test.ts`

The fuzz test uses seed `0x5ce7a109` and **3000 iterations**. Levels and density are biased
toward the extremes (10% chance of exactly 0, 10% of exactly 1), ~20% of entities are
disabled, and when an explicit ceiling is passed it is drawn from `[0, 449]` — deliberately
overshooting the global cap to exercise the clamping path.

Five invariants per run: the total respects both the explicit ceiling and the global 400 cap;
the total equals the sum of counts; every count is a non-negative integer within its node's
capacity; disabled entities get exactly 0; and at density 0 every count is 0.

### `controls.dom.test.tsx`

All queries go through **ARIA roles, not markup**, so structure and styling can change freely
as long as a range control and a numeric field remain. It checks
the range bounds, the accessible name, a non-blank `aria-valuetext` containing the value, the
non-color-only encoding, the paired spinbutton, the disabled state, exact `onChange` call
counts for valid input, and that `"abc"`, `""`, and `"NaN"` never fire `onChange` while
leaving the component usable afterward.

### `dashboard.dom.test.tsx`

Six tests over the dashboard components, all driving the **real store** rather than mocks —
`beforeEach` applies the default preset, pauses, clears the scrub, selects `thrombin`, and
clears reduced motion. Several tests then run the store forward with repeated
`advanceFrame(0.1)` calls followed by `publish()`, which is the supported way to build up
history synchronously in a test.

It covers `CollapsibleSection` toggling `aria-expanded` in step with its content; `KpiStrip`,
`InspectorPanel`, and `SceneTextMirror` all reading the **same** displayed snapshot; the
`TimelineScrubber` distinguishing Live, paused, and historical-replay modes; `TransportBar`
exposing accessible names for the three transport actions; and `SceneLegend` describing node
kinds plus the selection and inhibition cues in text.

Note that it asserts against **Korean UI strings** (for example `한 interval 진행`,
`기록 snapshot 재생`), so renaming a visible label will break it — deliberately.

---

## The policy scanner

[`policy.test.ts`](../src/tests/policy.test.ts) is the enforcement file, and the most common
source of surprising failures. It is a **static source-tree scanner**, not a runtime harness.

**Scope.** It walks `<repo>/src` recursively, skipping `node_modules`, `.next`, `.git`,
`dist`, `build`, and the entire `src/tests/` directory (the suite exempts itself). It reads
files ending in `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css` — currently 39 files.

> Repo-root files (`next.config.ts`, `package.json`, this `docs/` folder) are **outside the
> scan root** and are not checked.

**Comment stripping.** A hand-rolled state machine blanks `//` and `/* */` comments while
preserving every newline, so reported line numbers still match the file on disk. String
literal *contents* are left intact, so URLs written as strings are still detected. Some rules
run against stripped code, others against raw text — the distinction matters, and is noted
per rule below.

### Rule 1 — No storage or network APIs (scans stripped code)

`localStorage` · `sessionStorage` · `document.cookie` · `cookieStore` · `indexedDB`
(case-insensitive) · `XMLHttpRequest` · `sendBeacon` · `new WebSocket` · `EventSource` ·
bare `fetch(` · `window|globalThis|self .fetch(`

Because it runs on stripped code, prose like "this module never touches localStorage" in a
comment does not trip it.

### Rule 2 — No query-string state (scans stripped code)

`useSearchParams` · `URLSearchParams` · `location.search`

A run exists only in memory; simulation state must not be smuggled into the URL.

### Rule 3 — No raw HTML injection (scans **raw** text)

`dangerouslySetInnerHTML`

### Rule 4 — No remote assets (scans **raw** text)

Any `https?://…`. Because it runs on raw text, **an http(s) URL anywhere fails — including
inside a comment, and including an SVG XML namespace string.** Assets, fonts, and namespaces
must all be local.

### Rule 5 — Banned vocabulary (scans **raw** text, comments included)

This is the one that surprises people. Twenty case-insensitive patterns, applied to comments
and documentation as well as code, because comments are user-visible too:

`success(es|ful|fully)` · `failure(s)` · `safe(ly|ty|r|st)` · `unsafe(ly)` ·
`risk(s|y|ier|iest)` · `therapeutic(s)` · `dose|doses|dosed|dosing` · `dosage(s)` ·
`patient(s)` · `clinical(ly)` · `diagnos*` · `treat*` · `therapy|therapies` · `disease(s)` ·
`bleeding` · `thrombosis|thromboses` · `hemophilia*` · `anticoagul*` · `mg` · `IU`

The **only** allowed exception is the hyphenated compound `non-clinical`. A general
"preceded by a negation ⇒ exempt" escape hatch was explicitly rejected, because it would also
excuse "no risk" and "not unsafe" — exactly what the check exists to block. There are tests
proving those phrasings still fail.

Suggested neutral replacements, taken from the failure message itself: *network activity*,
*activation intensity*, *abstract role*, *handled*.

### Self-checks

Three meta-tests keep the scanner honest: it must collect more than 20 files, must include
`src/simulation/engine.ts` and `src/store/simulationStore.ts` while excluding everything
under `src/tests/`, and `stripComments` must preserve line count and string contents. A
negative control asserts that a synthetic probe string still produces violations, so the
vocabulary check can never silently pass by doing nothing.

### What this enforces

Rules 1, 2, and 4 together are the mechanism behind the **"nothing is stored, nothing is
sent"** promise. The production CSP in `next.config.ts` (`connect-src 'self'`) reinforces it
at deploy time, but no test reads that file.

**Known limits.** The scan is static, so a network call reached through an alias the regexes
do not model — a computed property name, a destructured `navigator.sendBeacon`, a runtime-built
`<img src>`, a dynamic `import()` of a remote URL — would pass. There is no runtime guard
stubbing `fetch` to throw.

---

## Other notable coverage gaps

- **Nothing asserts that any scope notice is rendered.** The dedicated `ScopeNotice` component
  was removed on 2026-08-03, leaving only a one-line subtitle in the header. The vocabulary
  scan constrains what such text may *say*, but no test requires it to exist.
- **`presets.test.ts` duplicates the banned-vocabulary list by hand.** Its copy uses a
  narrower `treats?` pattern where the policy file uses the broader `treat\w*` prefix, and it
  applies no `non-clinical` exception. The two lists can drift.
- **No 3D component is tested.** The particle budget is covered as a pure function, but no
  scene component is rendered in a test.

---

## Writing new tests

- Model logic goes in `src/tests/*.test.ts` (node environment). Component tests go in
  `src/tests/*.dom.test.tsx`.
- Query by **ARIA role**, not by class or markup structure.
- If you need randomness, use a **seeded** PRNG and record the seed, as the existing fuzz
  tests do. Never `Math.random()`.
- Reset the store in `beforeEach` — the engine behind it is a module singleton.
- Files under `src/tests/` are exempt from the policy scan, so a test may contain probe
  strings that would otherwise be banned.
