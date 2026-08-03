# Overview

## What the application does

Project Tenase integrates a small, data-driven directed graph of seven reactions over
thirteen abstract nodes, and renders the evolving state three ways at once: a stylized 3D
scene, a set of numeric readouts and charts, and a plain-text description of the scene for
assistive technology.

The graph is:

```
  Factor IX                      ->  Factor IXa        (opened by the damage signal)
  Factor IXa     + Factor VIIIa  ->  Tenase Complex
  Tenase Complex + Factor X      ->  Factor Xa
  Factor Xa      + Prothrombin   ->  Thrombin
  Thrombin       + Fibrinogen    ->  Fibrin

  TFPI                           -|  the Factor Xa pathway
  Antithrombin                   -|  active Thrombin
```

The user manipulates normalized supply values per node, a global initiation signal, a speed
multiplier, and a particle-density setting. Everything else is derived.

## Scope boundary — read this before writing anything

This is a **fictional, non-clinical educational visualization**. It is a visual systems
model, not a biology or medical model. The project makes no claim of biological accuracy,
models no real-world outcome, and contains no real data.

Concretely, and with consequences for how you write code and comments:

- Every user-facing quantity is a **dimensionless parameter on a normalized 0.0–1.0 scale**.
  There are no concentrations, units, masses, half-lives, or decision thresholds anywhere in
  the model.
- `time` counts **abstract model time units**, not real seconds.
- Entity names (Factor IX, Thrombin, Fibrin, …) are **labels on nodes of an abstract
  directed graph**. Reaction rate constants were chosen so the animation reads clearly on
  screen; they are not derived from, calibrated against, or validated by anything.
- The single exception to the 0–1 rule is `reactionEventCount`, an unnormalized integer
  counter of discrete abstract events.

The scope notice is not merely documentation. `src/tests/policy.test.ts` scans the whole of
`src/` — **including comments** — and fails the build if it finds vocabulary that would
imply clinical meaning. See [conventions.md](conventions.md#forbidden-vocabulary) for the
exact list before you write a comment.

In the running application the framing currently appears as the subtitle in the header of
[`AppShell.tsx`](../src/components/dashboard/AppShell.tsx). A dedicated `ScopeNotice` banner
component previously sat at the top of the main region; it was removed on 2026-08-03, so the
long-form notice now lives only in the project README.

## Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js `^16.2.12`, App Router | One route, no API routes, no server actions |
| UI runtime | React `^19.2.8` | Everything below `AppShell` is a client component |
| Language | TypeScript `^6.0.3` | `strict`, plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`; `allowJs: false` |
| 3D | `@react-three/fiber` `^9.7.0`, `three` `^0.185.1`, `@react-three/drei` `^10.7.7` | Instanced meshes only, no loaded assets |
| Charts | `recharts` `^3.10.1` | Five area charts, y-axis pinned to 0–1 |
| State | `zustand` `^5.0.14` | Vanilla store + `useStore` binding |
| Styling | `tailwindcss` `^4.3.3` via `@tailwindcss/postcss` | No `tailwind.config.*`; tokens live in `@theme` inside `globals.css` |
| Tests | `vitest` `^4.1.10`, `@testing-library/react` `^16.3.2`, `jsdom` | Two projects: `simulation` (node) and `ui` (jsdom) |
| Lint | `eslint` `^9.39.5` + `eslint-config-next` flat config | Type guarantees delegated to `tsc` |

Node.js 22 or newer is required. The working tree has been verified on Node v24.18.1.

## Commands

```bash
npm install
```

```bash
npm run dev
```

Then open `http://localhost:3000`.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server, telemetry disabled |
| `npm run build` | Production build, telemetry disabled |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint over the repo |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` — the full suite once |
| `npm run test:watch` | `vitest` in watch mode |
| `npm run verify` | lint → typecheck → test → build, in that order |

`npm run verify` is the gate to run before considering a change finished.

## Repository layout

```
src/
  app/                     App Router shell, metadata, theme tokens
    globals.css            Tailwind v4 entry + @theme design tokens
    layout.tsx             <html lang="ko">, metadata, viewport
    page.tsx               The only route; renders <AppShell/>
  components/
    charts/                Recharts signal charts
    controls/              Left panel — sliders, toggles, scenario picker
    dashboard/             Layout, transport, timeline, inspector, KPIs, a11y mirror
    three/                 React Three Fiber scene
  hooks/                   Animation clock, keyboard shortcut layer
  presets/                 Abstract scenario presets
  simulation/              Pure model layer — no React, no DOM, no WebGL
  store/                   Zustand store (memory only)
  tests/                   Vitest suites
docs/                      This folder
```

Root-level config: `next.config.ts`, `tsconfig.json`, `vitest.config.ts`,
`eslint.config.mjs`, `postcss.config.mjs`.

## Runtime characteristics

**No backend.** There are no API routes, server actions, analytics, or telemetry. The
application issues no network requests at runtime and loads no remote resources. Font stacks
resolve to fonts already present on the device.

**Nothing is stored.** The app uses no `localStorage`, `sessionStorage`, cookies,
`IndexedDB`, or query-string state. All simulation state lives in memory for the lifetime of
the page; a refresh starts a fresh run. This is enforced by a test that scans the source
tree — see [testing.md](testing.md#the-policy-scanner).

**Security headers.** [`next.config.ts`](../next.config.ts) disables `X-Powered-By` and sets
a strict Content-Security-Policy on every route, plus `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer`. In production the policy pins `connect-src 'self'` and
`form-action 'none'`, and forbids framing via `frame-ancestors 'none'`. `'unsafe-eval'` and
`ws:`/`wss:` are added in development only, for React Refresh and HMR.

## Known limitations

These are deliberate and documented in the README as well:

- The integration scheme is a simple explicit fixed-step update chosen for readability, not
  numerical sophistication.
- The graph is intentionally tiny and has no feedback edges.
- Scenario presets are abstract starting points, not scenarios about anything that exists.
