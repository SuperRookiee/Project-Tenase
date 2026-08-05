# Project Tenase

A personal project that runs a fictional reaction network — one that borrows only the
shape of the coagulation cascade — on top of Mol\*. Names like Factor IX and Thrombin are
labels on the nodes of a directed graph, nothing more. Every quantity is dimensionless and
lives in 0–1, and the rate constants were picked by hand so the animation reads well on
screen. Nothing here is calibrated, validated, or biologically accurate.

The Mol\* migration has reached Phase 1–2. Mol\* is the default renderer for the Simulation
workspace, and the older React Three Fiber scene is still reachable through
`NEXT_PUBLIC_SIMULATION_RENDERER=legacy-r3f`. Per-event reaction animation, full replay,
and the Molecule Explorer representation controls are not wired up yet.

Design background and per-layer detail live in [docs/](docs/), in English.
[docs/README.ko.md](docs/README.ko.md) is this same document in Korean.

## Reaction graph

A small graph — 13 nodes, 7 reactions — integrated with a fixed step.

```
  Factor IX                     ->  Factor IXa      (opened by the damage signal)
  Factor IXa     + Factor VIIIa ->  Tenase Complex
  Tenase Complex + Factor X     ->  Factor Xa
  Factor Xa      + Prothrombin  ->  Thrombin
  Thrombin       + Fibrinogen   ->  Fibrin

  TFPI                          -|  the Factor Xa path
  Antithrombin                  -|  active Thrombin
```

The outputs are network activity, activation intensity, inhibition intensity, the Thrombin
model signal, the Fibrin model signal, and a reaction event count. The only values you set
directly are the per-node supply, the global initiation signal, the speed multiplier, and
the particle density. Everything else is derived from those four.

## Workspaces

The top bar carries workspace switching, play/pause, model time, and the selected entity.
`⌘K` (`Ctrl+K` on Windows) opens a command palette that searches workspaces, molecules, and
reactions together and jumps straight to them. Every workspace except Simulation is code
split with `next/dynamic`.

**Simulation** — five KPI cards above a large Mol\* Canvas3D viewport, with selected level
and structure provenance panels docked on the right on desktop. The model parameter sliders
live inside a `모델 설정` drawer rather than being permanently on screen. Below the viewport
come the playback controls, the snapshot timeline, and a keyboard-reachable DOM mirror.

**Scenario comparison** — this one does not subscribe to the live engine. `scenarioSweep.ts`
builds a fresh engine on demand, runs it to the end of an observation window, and compares
the results. With the initiating node's supply, the damage signal, and the window length
pinned, it draws three runs side by side: a reference run, the current supply, and the
current supply with an external input applied. An external input pushes one node's level up
from outside the graph (`engine.applyInput`), either as a single pulse or as a sustained
trickle. The two lower charts sweep supply and input strength from 0 to 1 and plot the
attainment ratio against the reference run. One sweep is twenty-two runs, so the sweeps wait
for the settings to settle before catching up.

**Parameter map** — also independent of the live engine. Where scenario comparison follows
one axis and draws a curve, `parameterMap.ts` sweeps *two* at once and fills a 17×17 plane,
running the graph to the end of the window in every cell. Any two of nine settings can go on
the axes: the supply setpoint of a reservoir node, the damage signal, or a *hold* level. A
hold matters because transient nodes have no supply setpoint at all — the engine only relaxes
reservoir nodes toward one — so the only way to put Thrombin or Factor IXa at a level is to
keep topping it up from outside. The cells are colored by one of four outcomes, including the
fraction of the window the terminal structural node spent below the baseline. A replenishment
plan pushes a chosen node up from outside on a schedule — once, continuously, or at a fixed
interval a set number of times — and when it is switched on, the whole plane is recomputed
with it applied, so you can watch how far it moves a starved corner. The grid is a few
hundred runs, so it is filled one row per animation frame rather than in a single block.

**Reaction explorer** — `buildAnalysisEvents` reinterprets engine events and snapshots as
seven kinds — activation, binding, complex formation, dissociation, inhibition, decay,
reaction — and lays them out on a timeline. Dissociation and decay are not emitted by the
engine; they are read off actual level drops between snapshots, and they never feed back
into the simulated numbers. Picking an event and pressing `선택 반응 재생` scrubs to that
snapshot, switches to Simulation, and points the camera at the node.

**Molecule explorer** — per-node domains, active sites, and participating complexes, read
from `StructureRegistry`. The structure viewport slot is still empty: Phase 1–2 only brings
up a Mol\* context inside Simulation, and representation control plus domain selection belong
to Phase 5.

**Knowledge** — a cascade flow summary, a molecule dictionary, reaction descriptions, and a
glossary. Selecting an item opens the matching molecule or reaction in another workspace.

## Reading the Mol\* scene

Simulation lazy-loads a bundled RCSB PDB `6MV4` mmCIF and draws one real experimental Factor
IXa structure. The translucent vessel boundary and the damage band are Mol\* custom shapes,
and nodes that have no curated structure yet are stood in for by conceptual markers with
their provenance stated plainly. Selecting a marker or a molecule makes
`MolStarSelectionBridge` sync the application selection and the Mol\* highlight in both
directions.

Nodes sit inside the vessel in cascade order, left to right, and the flow edges joining them
change thickness and brightness with reaction activity. Markers travel downstream along
active edges, and inhibition edges are drawn dashed so they can be told apart without relying
on color. A node sphere's size and brightness follow that node's current level. The 6MV4
experimental structure occupies the Factor IXa slot itself.

Drag to rotate the camera; wheel or pinch to zoom. `카메라 리셋` returns to the opening
framing that fits the whole flow on screen, and `카메라 스토리` pans slowly through damage →
platelet → Tenase → Factor Xa → Thrombin → Fibrin.

### The legacy R3F scene

The older Three.js scene, reachable behind the feature flag. Behaviors that have not made it
over to Mol\* yet still live here.

The scene starts at the vessel damage and platelet surface on the left and reads left to
right through four zones: initiation, amplification, propagation, and Fibrin formation. It is
laid out that way so precursor/active transitions can be joined by position and arrows
without touching the engine graph. Bright flow lines are reactions active in the current
snapshot, dim lines are inactive paths, and a blocking bar at the end marks an inhibition
path.

- Free molecules jitter slightly, interpolating toward deterministic multi-wave targets.
  Active enzymes move a little faster, inhibitors a little slower.
- Each reaction kind gets its own short pulse: an expanding ring for activation, a faceted
  pulse for conversion, a spreading wave for Thrombin generation, a blocking mark for
  inhibition.
- FIXa and FVIIIa binding plays as the two shapes approaching, merging, and the Tenase shape
  settling into place.
- As the damage signal rises the platelet disks thicken and extend processes; as it falls
  they retrace the same path.
- Fibrin grows from a fixed origin, nearest branches first. When the signal drops it lowers
  density and opacity rather than rebuilding geometry.
- Hover previews neighboring interactions, click pins the selection. Upstream reactions and
  participating molecules of the selected molecule brighten while the rest dim.

### Color and shape legend

Color is a secondary cue. Every classification is repeated in shape, glyph, and short code.

| Classification | Representative shape | State cue |
| --- | --- | --- |
| Inactive coagulation factor | soft sphere, box, cone, or capsule | low baseline glow |
| Active factor / enzyme | faceted octahedron or angular box | bounded activity-driven glow |
| Cofactor | tetrahedron | `◇` glyph |
| Complex | icosahedron | `⬡` glyph |
| Inhibitor | torus clamp | `▽`/`▼`, blocking line `⊣` |
| Structural product | connected strand network | `✚` glyph |
| Platelet / surface | flattened disk | `⬢` glyph |

The selected molecule gets a double ring, four ticks, and a size increase together.

## KPIs and timeline

The Factor IX, Factor Xa, Thrombin, Fibrin, and inhibition KPIs show the `DerivedSignals` the
engine recorded into each snapshot, unmodified, and the charts read from the same snapshot
ring.

The timeline restores real snapshots — levels, derived signals, and reaction activity all
included — rather than being a UI-only time display. The three states are `Live`, paused, and
replaying a recorded snapshot; picking a recorded one halts progression. `실시간으로 복귀` is
enabled only while you are looking at a recording. Snapshots are held in a fixed-capacity ring
buffer of 600, recent events in one of 64.

## Keyboard

| Key | Action |
| --- | --- |
| `Space` | play / pause |
| `S` | advance one step |
| `R` | reset to the selected preset |
| `←` `→` `Home` `End` | move through timeline snapshots |
| `L` | return to the live view |
| `C` | start / stop the camera story |
| `⌘K` / `Ctrl+K` | command palette |
| `Escape` | stop the camera story, otherwise clear the selection |

Each one has an equivalent DOM button, and the global shortcuts stay out of the way while a
text field or slider has focus.

## Running it

Developed against Node.js 24.

```bash
npm install
```

```bash
npm run dev
```

Open `http://localhost:3000`.

`npm run verify` runs lint → type check → tests → production build in order. 239 tests across
14 files pass at the moment. The individual steps are `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run build`.

## Code layout

```
src/
  app/                     Next.js app router shell, theme tokens
  analysis/                reinterprets engine events as analysis events
  components/
    workspaces/            the five workspaces, command palette, top navigation
    molstar/               Mol* viewport lifecycle UI
    controls/              sliders, toggles, scenario picker
    dashboard/             shell, transport, timeline, inspector, accessibility mirror
    three/                 the legacy R3F scene behind the feature flag
    charts/                Recharts signal charts
  hooks/                   animation clock, keyboard controls, debounce
  simulation/
    types.ts               shared contract
    entities.ts            entity registry
    reactions.ts           data-driven reaction graph
    engine.ts              deterministic fixed-step integrator
    scenarioSweep.ts       batch scenario runner and sweeps
    parameterMap.ts        two-axis grid runner and replenishment plans
    scheduler.ts           dependency-injected animation clock
    snapshots.ts           ring buffers for history and events
    reactionTrace.ts       upstream path / neighbor computation
    particles.ts           particle budget allocation
    numeric.ts             normalized value validation
  presets/                 scenario presets
  store/                   Zustand store (memory only)
  molecules/               structure registry, provenance, adapters
  rendering/               renderer contract, flags, Mol* adapter, custom shapes
  tests/                   Vitest suites
```

`src/simulation/` is pure. It depends on neither React, DOM, WebGL, nor Mol\*, so it can be
tested in isolation, and because it uses no randomness at all, the same configuration and the
same step order always produce the same state.

The engine advances every animation frame, but React state is published at roughly 12 Hz. The
3D layer reads engine state directly inside its own render loop, so a 60 Hz scene does not
force 60 Hz re-rendering.

## Data

There is no backend. No API routes, no server actions, no analytics, no telemetry. Simulation
reads only the same-origin `/structures/6mv4.cif` and fetches no external structures at
runtime; external RCSB addresses are recorded in the registry as provenance links only. Type
resolves from fonts already on the device.

Nothing is stored either. No localStorage, sessionStorage, cookies, IndexedDB, or
query-string state, so all state lives in memory for as long as the page does and a refresh
starts a fresh run. A test that walks the source tree enforces this.

## Vocabulary

A test that walks the source tree blocks care-related and outcome-judging vocabulary.
Comments and doc strings are scanned too. So nothing in the code speaks of amounts
administered, procedures, or verdicts; it names the graph directly instead — nodes, edges,
levels, supply settings. The list lives in `src/tests/policy.test.ts`.

## Accessibility

The 3D scene is mirrored verbatim into DOM text with a live region. The canvas itself is
`aria-hidden`, and everything the scene can do is also reachable through keyboard-operable DOM
controls. Meaning never rests on color alone — every entity carries a glyph and a short code
alongside its color. Reduced motion can be turned on inside the app and also follows the
operating system setting. Where WebGL is unavailable, a fallback draws the entire network
state in DOM alone.

## Performance

Mol\* and the 605 KB mmCIF are lazy-loaded on the client only, after the viewport mounts. The
live scene brings up exactly one curated full structure and handles the rest as LOD 0 markers,
while the representation registry caps detailed structures at two.

The Mol\* custom shape is rebuilt only when a quantized fingerprint of levels and reaction
activity changes; when the network is quiet, rebuilding stops entirely. The scenario
comparison sweeps run twenty-two scenarios apiece, so they wait for the settings to settle
before catching up — meanwhile the three lightweight runs and the summary figures track the
sliders immediately.

The legacy scene caps on-screen particle instances at 400. A pure allocation function enforces
that ceiling and a fuzz test confirms it. On small screens particle density is lowered
automatically and DPR is capped at 1.75. Brownian position interpolation, platelet processes,
the vessel current, and Fibrin branches all reuse fixed-capacity typed arrays and instanced
meshes so the render loop allocates nothing per frame. WebGL context loss and restoration are
handled.

## Shortcomings

- The integration is a readable explicit fixed-step update, not a numerically sophisticated
  scheme.
- The graph is very small and has no feedback edges.
- 3D positions, the vessel, the damage patch, and particle shapes are spatial metaphors only.
- The Molecule Explorer structure viewport is still empty.
- The Mol\* side shows reaction activity through flow edge thickness, brightness, and
  traveling markers, but the per-event pulse animation still exists only in the legacy scene.
- Text inside a WebGL canvas does not reach the accessibility tree, so a separate DOM mirror
  re-describes the same snapshot roughly every two seconds.
- Reduced motion turns off Brownian motion and the camera story and converts pulses and glows
  into static cues. Selection, replay, the Inspector, and the model controls are unchanged.
