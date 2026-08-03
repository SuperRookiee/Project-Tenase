# Simulation engine

Everything in this document lives under [`src/simulation/`](../src/simulation/). That
directory is pure: it imports nothing from React, the DOM, or three.js, performs no I/O, and
touches no browser API. It is tested in a plain Node environment with no mocks.

**Reminder before you read on.** This is a *visual systems model*. The integration scheme,
rate constants, and smoothing constants were chosen so the animation reads clearly on
screen. They are not derived from, calibrated against, or validated by anything, and the
outputs are not measurements of any kind. Every quantity is dimensionless on a 0.0–1.0
scale; `time` counts abstract model time units.

---

## Entities

Thirteen nodes, defined once in [`entities.ts`](../src/simulation/entities.ts) as
`ENTITY_DEFINITIONS`.

| id | Label | Short | Glyph | Kind | Behavior | Default supply | Particles |
|---|---|---|---|---|---|---|---|
| `factorIX` | Factor IX | IX | ● | precursor | reservoir | 0.70 | yes |
| `factorIXa` | Factor IXa | IXa | ◆ | activated | transient | 0 | yes |
| `factorVIIIa` | Factor VIIIa | VIIIa | ◇ | cofactor | reservoir | 0.60 | yes |
| `tenaseComplex` | Tenase Complex | TEN | ⬡ | complex | transient | 0 | yes |
| `factorX` | Factor X | X | ■ | precursor | reservoir | 0.70 | yes |
| `factorXa` | Factor Xa | Xa | ◼ | activated | transient | 0 | yes |
| `prothrombin` | Prothrombin | PT | ▲ | precursor | reservoir | 0.75 | yes |
| `thrombin` | Thrombin | THR | ★ | activated | transient | 0 | yes |
| `fibrinogen` | Fibrinogen | FGN | ▬ | precursor | reservoir | 0.80 | yes |
| `fibrin` | Fibrin | FIB | ✚ | structural | terminal | 0 | no — own renderer |
| `tfpi` | TFPI | TFPI | ▽ | inhibitor | reservoir | 0.30 | yes |
| `antithrombin` | Antithrombin | AT | ▼ | inhibitor | reservoir | 0.45 | yes |
| `platelets` | Platelets | PLT | ⬢ | surface | reservoir | 0.65 | no — own renderer |

Each definition also carries `role` (a plain description), `color`, `shape`, and
`particleWeight`.

### Behaviors

`behavior` decides how a node's level drifts outside of explicit reactions:

- **`reservoir`** — relaxes toward its configured supply value at rate `replenishment`.
  These are the nodes the user actually controls with sliders.
- **`transient`** — starts at 0, is produced by reactions, and decays toward 0 at rate
  `clearance`.
- **`terminal`** — accumulates as a structural product and clears only very slowly
  (`fibrin` has `clearance: 0.02`).

`createInitialLevels` starts reservoirs at their supply value and everything else at 0, so
every run begins from a quiet network.

### Redundant encoding

`glyph` and `shortCode` exist so that **meaning never rides on color alone**. Any UI that
shows an entity's color must also show its glyph or short code. This is checked by a DOM
test — see [accessibility.md](accessibility.md).

---

## The reaction graph

Seven edges, defined in [`reactions.ts`](../src/simulation/reactions.ts) as
`REACTION_DEFINITIONS`.

| id | Label | Kind | Rate | Consumes | Produces | Modulators |
|---|---|---|---|---|---|---|
| `r1-activation` | Factor IX → Factor IXa | activation | 0.55 | factorIX | factorIXa | platelets (catalyst, floor 0.25) |
| `r2-binding` | Factor IXa + Factor VIIIa → Tenase Complex | binding | 0.70 | factorIXa, factorVIIIa | tenaseComplex | platelets (catalyst, floor 0.15) |
| `r3-conversion` | Tenase Complex + Factor X → Factor Xa | conversion | 0.80 | factorX | factorXa | tenaseComplex (catalyst, floor 0), tfpi (**inhibitor**, weight 0.85) |
| `r4-conversion` | Factor Xa + Prothrombin → Thrombin | conversion | 0.75 | prothrombin | thrombin | factorXa (catalyst, floor 0), platelets (catalyst, floor 0.30) |
| `r5-conversion` | Thrombin + Fibrinogen → Fibrin | conversion | 0.85 | fibrinogen | fibrin | thrombin (catalyst, floor 0) |
| `i1-inhibition` | TFPI ⊣ Factor Xa | inhibition | 0.60 | factorXa | — | tfpi (catalyst, floor 0) |
| `i2-inhibition` | Antithrombin ⊣ Thrombin | inhibition | 0.70 | thrombin | — | antithrombin (catalyst, floor 0) |

`r1-activation` is the only edge with `requiresDamageSignal: true`. With
`vesselDamageSignal` at 0 the whole network stays silent — a property asserted directly by
the test suite.

### Modulators

A modulator participates in an edge without being consumed:

- **`catalyst`** contributes a factor of `floor + (1 - floor) * level`. A `floor` of 0
  therefore makes the modulator **mandatory** — the edge carries zero flux without it. This
  is how `tenaseComplex` acts as a catalytic hub in `r3`, and how `factorXa` and `thrombin`
  drive their downstream edges.
- **`inhibitor`** contributes `1 - weight * level`. A weight-1 inhibitor at full level stops
  the edge completely.

Note the two distinct mechanisms by which an inhibitor node acts. `tfpi` both *weakens the
producing edge* `r3` (as an `inhibitor` modulator) and *directly removes* `factorXa` (via
the `i1-inhibition` edge, where it acts as a `catalyst` on removal). `antithrombin` only
does the latter.

### `GRAPH_EDGES`

`reactions.ts` also exports a flattened edge list with a `relation` of `produces`,
`consumes`, `catalyzes`, or `inhibits`. The accessibility text mirror and the WebGL fallback
both consume it, so inhibition is never conveyed by color alone.

---

## The integration step

[`engine.ts`](../src/simulation/engine.ts), `Engine.step()`. One call advances abstract model
time by exactly `FIXED_STEP = 1/60`.

For each reaction, in definition order:

1. **Gate.** If any participating node is switched off, flux is 0.
2. **Open flux** — what the edge would carry with inhibitory modulators removed:
   ```
   openFlux = rate * dt
   if (requiresDamageSignal) openFlux *= vesselDamageSignal
   for each reactant:  openFlux *= level[reactant]     // availability gates the edge
                                                       // whether or not it is consumed
   for each catalyst:  openFlux *= floor + (1 - floor) * level
   ```
3. **Inhibitor factor** is accumulated separately as `∏ (1 - weight * level)`, and
   `flux = openFlux * inhibitorFactor`.
4. **Capacity limit.** A single `limit` is computed from how much of each consumed reactant
   is available and how much headroom each product has before reaching 1. Both `flux` and
   `openFlux` are capped by it. This is what keeps every level inside 0–1 **without any
   post-hoc correction**.
5. **Apply.** Consumed reactants are decremented, products incremented, both through
   `clamp01`.
6. **Record.** Normalized per-reaction `activity = flux / dt / rate` is stored, flux is
   accumulated into either the activation or the inhibition total, and discrete events are
   emitted.

After the reaction sweep, baseline turnover runs for every entity: reservoirs relax toward
their target, transient and terminal nodes decay. A disabled node gets `DISABLED_DECAY = 2`
added to its rate so it drains quickly and its target becomes 0.

Finally `tick` and `time` advance, signals are recomputed, and every
`SNAPSHOT_INTERVAL_TICKS = 6` ticks a snapshot is recorded.

### Constants

| Constant | Value | Meaning |
|---|---|---|
| `FIXED_STEP` | `1/60` | One step of abstract model time |
| `MAX_SPEED_MULTIPLIER` | `4` | Step multiplier when `simulationSpeed` is 1.0 |
| `MAX_STEPS_PER_FRAME` | `8` | Catch-up ceiling per animation frame |
| `MAX_FRAME_DELTA_SECONDS` | `0.25` | Deltas above this are treated as a tab return and clipped |
| `EVENT_QUANTUM` | `0.02` | Accumulated turnover that constitutes one discrete event |
| `SIGNAL_SMOOTHING` | `0.12` | Exponential smoothing factor for intensity signals |
| `DISABLED_DECAY` | `2` | Extra decay applied to switched-off nodes |
| `ACTIVITY_EPSILON` | `1e-4` | Below this, a reaction counts as inactive |

`advance(deltaSeconds)` clips the delta, scales it by `simulationSpeed * 4`, and runs whole
fixed steps only, returning the number executed. If it hits `MAX_STEPS_PER_FRAME` it
**discards** the leftover accumulator rather than letting backlog snowball on slow frames.

---

## Derived signals

`DerivedSignals` carries eight normalized values plus one integer counter.

| Field | Definition |
|---|---|
| `networkActivity` | Weighted sum of levels: factorIXa 0.15, tenaseComplex 0.20, factorXa 0.20, thrombin 0.25, fibrin 0.20 |
| `activationIntensity` | Smoothed `activationRate / 1.2`, clamped |
| `inhibitionIntensity` | Smoothed `inhibitionRate / 0.6`, clamped |
| `factorIXModelSignal` | `levels.factorIXa` (the *activated* form, not the precursor) |
| `factorXaModelSignal` | `levels.factorXa` |
| `thrombinModelSignal` | `levels.thrombin` |
| `fibrinModelSignal` | `levels.fibrin` |
| `inhibitionModelSignal` | Per-node inhibition share — see below |
| `reactionEventCount` | Cumulative integer count of discrete abstract events. **Not normalized.** |

### `inhibitionModelSignal` vs `inhibitionIntensity`

These two are easy to confuse and the distinction is load-bearing. Do not "simplify" one
into the other — there is a regression test specifically guarding it.

`inhibitionIntensity` is a **throughput** measure: the magnitude of absolute inhibitory flux.
It is *not* monotonic in the inhibitor settings, because raising the first inhibitor starves
the downstream edges, collapsing the pool that the second inhibitory edge acts on, so
absolute inhibitory flux can *fall* as inhibition rises.

`inhibitionModelSignal` is a **ratio**, computed by `computeInhibitionShare()` per inhibited
node and then averaged:

```
        (directly removed  +  suppressed on that node's producing edges)
        ─────────────────────────────────────────────────────────────────
        (uninhibited production            +  directly removed)
```

Scoping the ratio to a single node's own edges is what makes it well-behaved. Numerator and
denominator scale with the same pool, so the result rises when *either* inhibitor node is
raised and ignores whatever the rest of the graph is doing. An earlier whole-network ratio
was rejected because it spiked whenever an unrelated edge saturated against the level
ceiling. This is the signal the charts plot.

---

## Determinism

The engine uses **no randomness at all**. The same config and the same sequence of `step`
calls always produce the same state — including identical event id strings, which are built
from `reactionId:tick:sequence`.

The test suite asserts this directly: two engines from the same config, stepped 1500 times,
must produce byte-identical levels, signals, and event id sequences; and a `reset` mid-run
must reproduce the same trajectory.

Where the *scene* needs scattered positions, it uses a seeded mulberry32 generator in
[`sceneLayout.ts`](../src/components/three/sceneLayout.ts), never a platform random source —
and simulation state is never derived from it.

---

## Supporting modules

### `numeric.ts` — the 0–1 guard

The only place the normalized invariant is enforced. Three entry points with deliberately
different failure modes:

| Function | On unusable input |
|---|---|
| `clamp01(value)` | **Throws `RangeError`** on `NaN`/`Infinity`. Refuses to silently coerce, because clamping them would hide an upstream defect. |
| `parseNormalized(input)` | Returns **`null`**. Accepts numeric strings; clamps out-of-range *finite* values (a range slider reporting its own bound is normal). |
| `assertNormalized(value, label)` | **Throws `RangeError`** with the label in the message. Used at the engine boundary where silent ignoring would mask a bug. |

Display helpers `formatNormalized` and `formatPercentOfScale` exist so values are shown
without implying measurement precision, and as fractions of scale rather than units.

### `snapshots.ts` — bounded history

A minimal `RingBuffer<T>` that yields items in insertion order. `toArray()` allocates, so
callers must read on the UI cadence, not per step.

| Constant | Value |
|---|---|
| `MAX_SNAPSHOTS` | 600 |
| `MAX_EVENTS` | 64 |
| `SNAPSHOT_INTERVAL_TICKS` | 6 |

Each `SimulationSnapshot` records `tick`, `time`, `levels`, `signals`, **and
`reactionActivity`** — all copied, since the engine mutates its working records in place.
Capturing per-reaction activity is what lets the inspector and the 3D scene replay a
historical sample faithfully rather than mixing old levels with live edge activity.

`clampSnapshotIndex(index, length)` returns `null` when there is no history, rounds
fractional input, and falls back to the newest position for non-finite input.

### `particles.ts` — the visual budget

`MAX_VISIBLE_PARTICLES = 400` is an absolute ceiling on simultaneously visible instances,
enforced by a **pure function** so it can be verified without a WebGL context.
`PARTICLE_CAPACITY` splits the budget by `particleWeight` once at module load, handing the
rounding remainder to the first particle entity so the table sums exactly to the cap.
`fibrin` and `platelets` are excluded — they have dedicated renderers and capacity 0.

`allocateParticles(levels, density, enabled?, maxParticles?)` scales counts by level and
density, floors each node at `MIN_PARTICLES_PER_ENTITY = 2` when present at all, caps per
node, and proportionally shrinks if the total would exceed the ceiling. A seeded fuzz test
runs 3000 randomized allocations asserting the cap always holds.

### `reactionTrace.ts` — precomputed highlight sets

A pure helper for the scene's focus effects. It reads reaction definitions only and computes
no flux, levels, or signals.

| Function | Returns |
|---|---|
| `getReactionTrace(id)` | `{ entityIds, reactionIds }` — everything upstream on the **production path** that leads to `id`, found by walking producing edges backwards through reactants and catalyst modulators. Inhibition edges are skipped. |
| `getInteractionNeighbors(id)` | Every node that shares at least one reaction with `id`, including `id` itself. |

Both are computed **once at module load** for all thirteen nodes and cached in a `Map`, so
the render loop can call them per frame at no cost. Unknown ids throw `RangeError`.

The traversal is guarded against revisiting nodes, so the recursion terminates even though
the walk is over a graph.

### `scheduler.ts` — the injected clock

`createScheduler(onFrame, deps)` takes `requestFrame`/`cancelFrame`/`now` as dependencies so
the entire clock can be driven synchronously in tests with no real timers. It converts
millisecond timestamps to seconds, clamps to `MAX_SCHEDULER_DELTA_SECONDS = 0.25`, and never
emits a negative delta. `start()` is idempotent; `pump(delta)` runs exactly one frame without
starting or stopping the loop.

The division of labor: **the scheduler owns *when* the engine advances; the engine owns *how
far*.**

---

## Engine contract

```ts
interface SimulationEngine {
  getConfig(): SimulationConfig;
  getState(): SimulationState;          // levels are mutated in place — copy to retain
  configure(patch: Partial<SimulationConfig>): void;   // throws RangeError on bad numbers
  setSupply(id: EntityId, value: number): void;
  setEnabled(id: EntityId, enabled: boolean): void;
  step(): void;                         // exactly one fixed step
  advance(deltaSeconds: number): number;// whole steps only; returns count
  reset(config?: SimulationConfig): void;
  getSnapshots(): readonly SimulationSnapshot[];
  getEvents(): readonly ReactionEvent[];
  getActiveBindings(id: EntityId): readonly ActiveBinding[];
}
```

`getActiveBindings` is part of the contract but currently has **no UI caller** — the
inspector derives bindings from the displayed `reactionActivity` instead, so that they follow
the timeline into history.

Implementations must be deterministic, perform no I/O, and touch no browser API. Invalid
numbers throw `RangeError` **without partially applying** the patch — also asserted by tests.
