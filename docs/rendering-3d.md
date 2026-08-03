# 3D rendering layer

Everything under [`src/components/three/`](../src/components/three/). Built on React Three
Fiber 9 and three 0.185, with `@react-three/drei` for `OrbitControls`, `Billboard`, and
`AdaptiveDpr`.

**The scene loads no remote resources.** No environment maps, textures, fonts, or model
files. Every mesh is built from three.js primitive geometries.

---

## Scene composition

[`SceneCanvas`](../src/components/three/SceneCanvas.tsx) is the stage. Inside `<Canvas>`:

| Component | Draws |
|---|---|
| [`VesselEnvironment`](../src/components/three/VesselEnvironment.tsx) | The stylized open-ended tube, guide rings, and the display patch driven by the damage signal |
| [`PlateletSurfaces`](../src/components/three/PlateletSurfaces.tsx) | Flat discs adhering to the wall around the patch, representing the surface node |
| [`FlowGuides`](../src/components/three/FlowGuides.tsx) | One thin cylinder per graph edge, with a cone head for normal edges and a cross-bar for inhibitory ones |
| [`FibrinNetwork`](../src/components/three/FibrinNetwork.tsx) | The structural mesh that grows outward from the display region |
| [`ParticleField`](../src/components/three/ParticleField.tsx) | Free-floating instances for the nine particle-rendered nodes |
| [`ReactionPulses`](../src/components/three/ReactionPulses.tsx) | Transient markers at each edge site, driven by per-reaction activity |
| [`SelectionMarker`](../src/components/three/SelectionMarker.tsx) | The halo around the currently selected node's zone |

Camera: `position [0.2, 4.4, 13.8]`, `fov 40`, `near 0.1`, `far 80`. `OrbitControls` allows
rotate and zoom (distance 4.5–24) but **not pan**, and a "카메라 리셋" button restores the
initial framing. `dpr` is capped at `[1, 1.75]` and `AdaptiveDpr` plus
`performance={{ min: 0.5 }}` let the renderer degrade resolution under load.

A four-phase strip overlays the top of the stage — 개시 / 증폭 / 전파 / Fibrin 형성
(initiation, amplification, propagation, fibrin formation) — matching the left-to-right
layout of the graph.

---

## `useEngineFrame` — the read-only bridge

[`useEngineFrame.ts`](../src/components/three/useEngineFrame.ts) is how every scene component
gets data. **It reads only.** It never calls `advance` or `step`; the app clock in `AppShell`
is the sole writer. If the scene also stepped the engine, the run would stop being
deterministic.

```ts
useEngineFrame((ctx) => { /* mutate meshes here */ });
```

**Historical replay.** When the timeline is being scrubbed, the hook serves the scrubbed
snapshot's `levels`, `signals`, and `reactionActivity` instead of the engine's live state, so
the 3D scene replays history in step with every DOM readout. When `scrubIndex` is `null` it
falls through to live engine state as usual.

The context object is **reused across frames** — the same object with fields overwritten — so
the loop allocates nothing. Never retain it or anything it points at:

| Field | Meaning |
|---|---|
| `levels` | Level record — live, or the scrubbed snapshot's. Live records are **mutated in place by the engine, so do not store them.** |
| `signals` | Derived signals, live or scrubbed |
| `reactionActivity` | Per-reaction normalized activity, live or scrubbed |
| `config` | Current config from the store |
| `selectedEntityId` | Current selection |
| `hoveredEntityId` | Transient hover focus, or `null` |
| `reducedMotion` | True if either the in-app toggle or the OS preference asks for it |
| `delta` | Seconds since the previous frame, clamped to `MAX_VISUAL_DELTA_SECONDS = 0.1` |
| `elapsed` | Animation phase clock in seconds — **frozen while reduced motion is active** |

Freezing only the phase clock, rather than skipping the callback entirely, is deliberate:
drift and pulsing stop in a readable resting pose while level changes remain visible.

The reduced-motion media query is created once at module scope and its match cached, so
reading it costs nothing per frame.

---

## Per-frame budget rules

These rules are why the scene stays smooth, and breaking them is the most likely way to
regress performance.

1. **Never allocate inside the render loop.** Scratch `THREE.Object3D`, `Vector3`, and
   `Quaternion` instances are hoisted to module scope in every component that needs them.
2. **Instanced meshes are allocated once at capacity and never resized.** Only `.count`
   changes at runtime, so the scene cannot exceed its instance budget.
3. **Precompute layouts in `useMemo`.** Positions, orientations, and phase offsets are packed
   into a flat `Float32Array` with a documented stride, built once.
4. **No pointer handlers on the canvas.** Selection is driven entirely by DOM controls, which
   keeps raycasting out of the render loop and keeps selection keyboard-accessible.

### Instance caps

| Renderer | Cap | Source |
|---|---|---|
| `ParticleField` | 400 total across all nodes | `MAX_VISIBLE_PARTICLES` in `simulation/particles.ts` |
| `FibrinNetwork` | 120 strands | `MAX_STRANDS` |
| `PlateletSurfaces` | 48 discs | `MAX_PLATELET_INSTANCES` |

The particle budget is computed by a **pure function**, `allocateParticles`, so the cap is
verifiable without a WebGL context. A seeded fuzz test runs 3000 randomized allocations
against it. `fibrin` and `platelets` are excluded from that budget entirely — they have
`renderAsParticles: false` and their own dedicated renderers.

`ParticleField` recomputes its allocation only every `ALLOCATION_INTERVAL_SECONDS = 0.05`
rather than per frame, and scales density down on narrow viewports (0.55 below 640 px, 0.78
below 960 px).

---

## Scene layout

[`sceneLayout.ts`](../src/components/three/sceneLayout.ts) holds every static coordinate.
All of it is invented staging chosen to make the abstract graph readable; none of it depicts
real anatomy or real molecular structure, and the units are arbitrary scene units.

| Export | Purpose |
|---|---|
| `VESSEL_RADIUS` (2.6), `VESSEL_LENGTH` (15) | Tube dimensions |
| `DAMAGE_CENTER`, `FIBRIN_CENTER` | The two anchor points on the lower wall |
| `ENTITY_ZONES` | Per-node spherical region: `{ center, radius }` |
| `REACTION_SITES` | Where each edge's pulse marker sits, between the zones it connects |
| `createSeededRandom(seed)` | mulberry32 PRNG |

Nodes are laid out along +X so the graph reads left to right without relying on color:
upstream precursors at negative X, the central output and structural stage at positive X, and
the two inhibitor nodes offset beside the nodes they attenuate.

**The scene always uses `createSeededRandom`, never `Math.random`.** The same seed always
produces the same arrangement. Simulation state is never derived from it — it affects only
how the abstract layout is scattered on screen.

---

## Encoding without color

Every visual distinction in the scene has a non-color carrier. This is a hard requirement,
not a nicety.

**Reaction pulses** are distinguished by geometry first:

| Kind | Shape |
|---|---|
| activation | An expanding open ring |
| binding | Two rings converging toward each other |
| conversion | A solid octahedron spinning inside a wireframe cage |
| inhibition | A contracting ring behind a crossed-bar mark |

**Flow guides** give inhibitory edges a cross-bar head where other edges get a cone.

**The display patch** carries three redundant cues: the filled patch, a bright outline ring,
and a raised wireframe dome.

**Selection** is signalled three ways at once: the halo ring, four radial ticks around it,
and a scale boost on that node's particles — plus the DOM inspector stating it in text.

### Focus highlighting

`ParticleField` dims nodes that are not relevant to the current focus, using the precomputed
sets from [`reactionTrace.ts`](../src/simulation/reactionTrace.ts):

- **In the selection's production trace** — `getReactionTrace(selectedEntityId).entityIds`,
  the upstream path that leads to the selected node.
- **Near the hover** — `getInteractionNeighbors(hoveredEntityId)`, everything sharing an edge
  with the hovered node.

A node that is selected or hovered renders at full opacity; one that is in the trace *and*
near the hover renders at 0.82; everything else drops to 0.12. With nothing selected or
hovered, the corresponding test passes vacuously, so the default view is unfiltered.

Because both sets are computed once at module load, this costs nothing per frame.

---

## Reduced motion in the scene

`ctx.reducedMotion` is true if the in-app toggle **or** the OS preference asks for it. Each
renderer handles it by freezing to a readable pose rather than disappearing:

- `ParticleField` — drift and spin freeze, but base rotation derived from each particle's
  phase keeps them from snapping into alignment.
- `ReactionPulses` — the phase is pinned to `STATIC_CYCLE = 0.45`, mid-cycle.
- `VesselEnvironment` — the patch pulse is pinned to 0.5.
- `FibrinNetwork`, `PlateletSurfaces`, `SelectionMarker` — shimmer, wobble, and rotation stop.
- `OrbitControls` — damping is disabled.

---

## WebGL policy

**Detection.** `detectWebglSupport()` creates a throwaway canvas and tries `webgl2` then
`webgl`. It runs inside an effect, so server rendering is never touched, and `<Canvas>` is
mounted only after support is confirmed. `webglAvailable` is `null` until then, and the stage
shows a checking message.

**Context loss.** Listeners are attached in `onCreated` and torn down on unmount.
`webglcontextlost` calls `preventDefault()` so the browser may attempt recovery, sets a flag,
and shows an overlay explaining that the model is still running and all readouts stay live.
`webglcontextrestored` clears the flag and the stage redraws itself.

**Fallback.** When WebGL is unavailable, [`WebglFallback`](../src/components/three/WebglFallback.tsx)
renders a DOM-only view. It is not a placeholder — it carries the same information the 3D
layer does: every node with glyph, short code, label, and normalized level as a `role="meter"`
bar, plus the complete edge list grouped by reaction with per-edge relation labels
(→ produces, ⊗ consumes, ⇢ catalyzes, ⊣ inhibits).

Because the clock lives in `AppShell` rather than inside the canvas, the network keeps
advancing and every control keeps working in the fallback.
