# UI layer (DOM)

Covers everything under `src/components/dashboard/`, `src/components/controls/`, and
`src/components/charts/`. The 3D layer has its own document,
[rendering-3d.md](rendering-3d.md).

Every component here is a client component. All of them read state through
`useSimulationStore` with a selector.

---

## Dashboard

[`src/components/dashboard/`](../src/components/dashboard/)

| Component | Role |
|---|---|
| [`AppShell`](../src/components/dashboard/AppShell.tsx) | The single client boundary. Mounts the clock and keyboard hooks, renders the three-region layout, owns the panel collapse state. |
| [`KpiStrip`](../src/components/dashboard/KpiStrip.tsx) | Five headline model signals as cards. Each card selects only its own signal, so cards re-render independently. |
| [`TransportBar`](../src/components/dashboard/TransportBar.tsx) | Play/pause, single step, reset; readouts for tick, model time units, and event count; a mode badge reading Live, 일시정지, or 기록 재생. |
| [`TimelineScrubber`](../src/components/dashboard/TimelineScrubber.tsx) | A range input over the snapshot ring, a matching mode badge, and a "return to live" button. Carries a descriptive `aria-valuetext`. |
| [`SceneTextMirror`](../src/components/dashboard/SceneTextMirror.tsx) | The accessibility mirror of the 3D scene. See [accessibility.md](accessibility.md). |
| [`KeyboardHelp`](../src/components/dashboard/KeyboardHelp.tsx) | Documents every shortcut. Mirrors `useKeyboardControls` and must be updated alongside it. |
| [`InspectorPanel`](../src/components/dashboard/InspectorPanel.tsx) | Right panel: the selected node's definition, its live bindings, its inhibitory relationships, and recent events. |
| [`SceneLegend`](../src/components/dashboard/SceneLegend.tsx) | Maps glyphs and 3D shapes to node kinds, and explains the scene's non-color cues. |
| [`CollapsibleSection`](../src/components/dashboard/CollapsibleSection.tsx) | Shared accessible disclosure with `aria-expanded` / `aria-controls`. State is component-local; nothing is written to browser storage. |

### `InspectorPanel` details

Two non-obvious pieces:

- **Bindings are derived from displayed activity**, not read from the engine. The panel walks
  `REACTION_DEFINITIONS`, keeps reactions the selected node participates in whose
  `selectDisplayed(state).reactionActivity` exceeds `0.0001`, and sorts by descending
  strength. Because it reads through `selectDisplayed`, bindings follow the timeline into
  history rather than always showing the live step. (The engine still exposes
  `getActiveBindings`, but no UI calls it any more.)
- **Event list.** Events are filtered to `event.tick <= displayedTick` so scrubbing back does
  not reveal events that had not happened yet, then reversed to newest-first, optionally
  filtered to those mentioning the selected node, and capped at `MAX_LISTED_EVENTS = 12`. The
  filter is a radio group inside a `<fieldset>` with an `sr-only` legend.

The "inhibitory relationships" block finds reactions where the selected node is either part
of an `inhibition` edge or acts as an `inhibitor` modulator — so inhibition is stated in
words, not implied by a color.

---

## Controls

[`src/components/controls/`](../src/components/controls/)

[`ControlPanel`](../src/components/controls/ControlPanel.tsx) stacks four collapsible
sections in the left region:

| Section | Component | Contents |
|---|---|---|
| 시나리오 (Scenario) | [`ScenarioPresetPicker`](../src/components/controls/ScenarioPresetPicker.tsx) | Radio group over the seven presets, plus a summary of the selected one's "what changes" and "what to watch" |
| 전역 파라미터 (Global) | [`GlobalParameterControls`](../src/components/controls/GlobalParameterControls.tsx) | Vessel damage signal, simulation speed |
| 분자 컨트롤 (Nodes) | [`EntityControls`](../src/components/controls/EntityControls.tsx) | Per-node supply slider, participation checkbox, and an "inspect" button — grouped by entity kind |
| 표시 설정 (Display) | [`DisplaySettings`](../src/components/controls/DisplaySettings.tsx) | Particle density, reduced-motion toggle |

`EntityControls` disables the supply slider for nodes whose `behavior !== 'reservoir'`,
because the network produces those values rather than the user setting them, and says so in
the description text rather than leaving the control mysteriously inert.

### `NormalizedSlider` — the shared primitive

[`NormalizedSlider.tsx`](../src/components/controls/NormalizedSlider.tsx) is the single
control primitive for every normalized parameter in the app. It has a DOM test suite all to
itself ([`controls.dom.test.tsx`](../src/tests/controls.dom.test.tsx)), so its contract is
fixed:

| Guarantee | Detail |
|---|---|
| Range bounds | `type="range"`, `min="0"`, `max="1"`, `step={0.01}` |
| Accessible name | The visible label is associated via `htmlFor`, not merely adjacent |
| `aria-valuetext` | Always present and non-blank; expresses the value as a percentage of full scale |
| Precision field | A paired `type="number"` spinbutton, also bounded 0–1, with an `sr-only` label |
| Non-color encoding | A color swatch renders **only** when a glyph or short code accompanies it |
| Disabled | Disables both the range and the number input |
| Invalid input | `"abc"`, `""`, `"NaN"` never fire `onChange`; the committed value survives, and the next valid entry works normally |

The number field keeps a local `draft` string while focused so a partially typed value is not
overwritten on every keystroke; blur resets the draft to the committed value.

`onChange` is only ever called with a parsed, in-range number — callers never see raw input.

---

## Charts

[`src/components/charts/`](../src/components/charts/)

[`SignalChartGrid`](../src/components/charts/SignalChartGrid.tsx) renders five
[`SignalChart`](../src/components/charts/SignalChart.tsx) instances:

| Title | Data key | Source signal |
|---|---|---|
| Factor IX 모델 신호 | `factorIX` | `factorIXModelSignal` (tracks Factor IX**a**, the activated form) |
| Factor Xa 모델 신호 | `factorXa` | `factorXaModelSignal` |
| Thrombin 모델 신호 | `thrombin` | `thrombinModelSignal` |
| Fibrin 모델 신호 | `fibrin` | `fibrinModelSignal` |
| 억제 모델 신호 | `inhibition` | `inhibitionModelSignal` — the per-node ratio, not absolute throughput |

**Decimation.** The snapshot ring holds up to 600 samples, far more than a 150 px chart can
resolve. `buildChartRows` takes every *n*-th sample to stay under
`MAX_CHART_POINTS = 120`, and always appends the newest sample so the curve reaches the right
edge and the visible window does not jitter.

**Chart conventions.** The y-axis is pinned to `[0, 1]` with ticks at 0, 0.5, and 1, so charts
can be compared by eye without reading axes. The x-axis counts abstract model time units.
Each title carries the entity's glyph, so no series is distinguished by color alone. Recharts
animation is disabled when reduced motion is active.

The chart canvas itself is `aria-hidden="true"`: it is a redundant representation of numbers
already available as text in the scene mirror and the inspector, so announcing it per tick
would be noise.

---

## Styling

Tailwind CSS v4 with **CSS-first configuration** — there is no `tailwind.config.*`. Design
tokens live in an `@theme` block in [`src/app/globals.css`](../src/app/globals.css):

| Token group | Tokens |
|---|---|
| Surfaces | `--color-surface-0` … `--color-surface-4`, `--color-line`, `--color-line-strong` |
| Text | `--color-ink-0`, `--color-ink-1`, `--color-ink-2` |
| Accents | `--color-accent`, `--color-accent-dim` |
| Semantic | `--color-activation`, `--color-binding`, `--color-inhibition`, `--color-structural`, `--color-caution` |
| Fonts | `--font-sans`, `--font-mono` — device-local stacks only, no remote fonts |

Tokens become utilities automatically, so `--color-surface-1` is usable as `bg-surface-1`.

`globals.css` also defines a consistent `:focus-visible` outline, thin scrollbars, and the
reduced-motion rules described in [accessibility.md](accessibility.md).

No remote resource is referenced anywhere in the stylesheet — enforced by the policy scanner,
which fails on any `http(s)://` URL under `src/`.
