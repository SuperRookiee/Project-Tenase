# Accessibility

Accessibility here is a structural property of the application, not a layer applied
afterward. The 3D scene is treated as decoration and the real interface is the DOM, which is
why the canvas can be hidden from assistive technology without losing any information.

---

## The canvas is decorative; the text mirror is authoritative

The canvas wrapper carries `aria-hidden="true"` and has no role of its own, so assistive
technology is never asked to interpret a picture. The scene's full state is published as
live text by [`SceneTextMirror`](../src/components/dashboard/SceneTextMirror.tsx).

**Nothing inside the canvas is the only route to any information, and every interaction the
scene supports also exists as a keyboard-operable DOM control.** Selection, for instance, is
driven by the "살펴보기" buttons in the control panel — the canvas has no pointer handlers at
all.

### How the mirror works

`describeScene(state)` builds a list of plain sentences covering:

1. Current tick and model time, and whether the view is live or a historical sample.
2. The abstract damage signal, as a number and as a percentage of full scale.
3. Nodes present above `PRESENCE_THRESHOLD = 0.01`, each with glyph, short code, label, and
   normalized level.
4. Nodes near zero, and nodes switched off — listed separately.
5. Active edges above `ACTIVITY_THRESHOLD = 0.005`, ordered by descending strength.
6. A qualitative description of the structural mesh, bucketed by `fibrinModelSignal`.
7. Aggregate network activity, activation intensity, and inhibition intensity.

**Cadence.** The store publishes about twelve times a second, which is far too fast for a
screen reader. The mirror rebuilds its description on a **2-second interval**
(`ANNOUNCE_INTERVAL_MS`) and reads the store imperatively inside that timer, so the component
re-renders on the announcement cadence rather than the publish cadence. It also compares the
new text against the previous and skips the update when nothing changed, so a quiet network
does not repeat the same sentence indefinitely.

**Dual exposure.** The live region is `sr-only` but `tabIndex={0}`, so a sighted keyboard user
can tab to it and read exactly what is being announced. The same lines are additionally
available in a `<details>` block labelled "장면 설명을 글로 보기".

Everything the mirror reports — including edge activity — comes from `selectDisplayed`, so
while the timeline is scrubbed it describes the historical sample rather than the live step,
consistent with what the scene and the inspector are showing.

---

## Meaning never rides on color alone

Every entity carries a `glyph` and a `shortCode` alongside its color, and every surface that
uses the color also shows one of them.

| Surface | Redundant carrier |
|---|---|
| `NormalizedSlider` | The color swatch renders **only** when a glyph or short code is also present |
| Charts | Each chart title carries the entity glyph |
| `KpiStrip` | Each card shows the entity glyph beside the label |
| `WebglFallback` | Glyph, short code, label, and numeric level on every bar |
| `SceneTextMirror` | Glyph and short code in every node mention |
| Scene — reaction pulses | Four distinct geometries, one per reaction kind |
| Scene — flow guides | Cross-bar head for inhibition, cone head otherwise |
| Scene — selection | Halo ring, four radial ticks, and a particle scale boost |
| Scene — display patch | Filled patch, outline ring, and wireframe dome |

This is verified in [`controls.dom.test.tsx`](../src/tests/controls.dom.test.tsx), which
asserts that a slider rendered with an accent color also renders its glyph or short code — a
WCAG 1.4.1 "use of color" check.
[`dashboard.dom.test.tsx`](../src/tests/dashboard.dom.test.tsx) covers the same ground for
the scene legend, checking that node kinds and the selection and inhibition cues are all
described in text.

---

## Keyboard layer

[`useKeyboardControls`](../src/hooks/useKeyboardControls.ts) provides shortcuts as a
*shortcut layer*, never as the only route to a feature. Every shortcut has a visible control,
and [`KeyboardHelp`](../src/components/dashboard/KeyboardHelp.tsx) documents all of them.

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `R` | Reset to the selected scenario preset |
| `S` | Advance one step |
| `←` / `→` | Move the timeline cursor one sample |
| `Home` / `End` | Jump to the oldest / newest sample |
| `L` | Leave the timeline and return to live |
| `Escape` | Clear the node selection |

### Stand-down rules

The handler yields in three situations, each for a concrete reason:

- **Any modifier key is held** — the user is invoking a browser or OS command.
- **The event target is a text-entry target** (`INPUT`, `TEXTAREA`, `SELECT`, or
  `isContentEditable`). Typing in a field, or nudging a range slider with the arrow keys,
  must never also drive the transport. The check is **structural rather than
  `instanceof`-based**, so it behaves identically inside an iframe or a test document with
  its own realm.
- **`Space` on an activation target** (`BUTTON`, `A`, `SUMMARY`, or `role="button"`). Space
  natively activates a focused button; intercepting it there would make the reset button
  toggle playback instead of resetting.

Everything else falls through to the browser.

---

## Focus, structure, and landmarks

- A skip link ("본문 영역으로 건너뛰기") is the first focusable element and targets
  `#main-region`, which is `tabIndex={-1}` so it can receive programmatic focus.
- `globals.css` defines a single consistent `:focus-visible` outline — a 2 px accent outline
  with offset — applied everywhere.
- The layout uses real landmarks: `<header>`, `<main>`, and two `<aside>` elements with
  `aria-label`. Panel collapse buttons use `aria-expanded` with `aria-controls` pointing at
  the region they toggle.
- Every section is headed, with `sr-only` headings where a visible one would be redundant
  (`TransportBar`, `SceneTextMirror`).
- Grouped controls sit inside `<fieldset>` with a `<legend>` — the scenario radio group, the
  global parameters, the display settings, and the inspector's event filter.
- `CollapsibleSection` wires `aria-expanded` to `aria-controls` with a generated stable id.
- Level bars in the fallback use `role="meter"` with `aria-valuemin`, `aria-valuemax`,
  `aria-valuenow`, and a descriptive `aria-valuetext`.

### `aria-valuetext` everywhere

Raw normalized numbers are meaningless read aloud. Range controls therefore always carry a
text form:

- `NormalizedSlider` — `formatPercentOfScale(value)`, e.g. "전체 척도의 63%".
- `TimelineScrubber` — a full sentence: position within the sample count, whether it is the
  newest sample and tracking live, plus tick and model time.

---

## Reduced motion

Two independent sources, unified into one effective flag: the **in-app toggle** in
`DisplaySettings`, and the **OS preference** `(prefers-reduced-motion: reduce)`.

`useSimulationClock` subscribes to the media query — supporting both the modern
`addEventListener` and the legacy `addListener` APIs — and writes the effective flag onto
`<html data-reduced-motion>`.

Three mechanisms then act on it:

1. **CSS** — `globals.css` collapses animation and transition durations under both
   `@media (prefers-reduced-motion: reduce)` and `html[data-reduced-motion='true']`.
2. **The 3D layer** — `useEngineFrame` freezes its phase clock, so drift, pulsing, and camera
   damping stop while level changes remain visible. See
   [rendering-3d.md](rendering-3d.md#reduced-motion-in-the-scene).
3. **Charts** — Recharts animation is disabled on both the area and the tooltip.

---

## WebGL fallback parity

When WebGL is unavailable the DOM-only fallback carries the same information as the scene:
every node with glyph, short code, label, and level meter, plus the full edge list with
explicit relation labels. Because the simulation clock is mounted in `AppShell` rather than
inside the canvas, the model keeps advancing and every control keeps working.

Context loss is handled the same way — an overlay explains that the model is still running
and all readouts stay live while the stage waits to redraw itself.

---

## Known gaps

**The in-app scope notice is gone.** A dedicated `ScopeNotice` banner used to head the main
region, carrying the short and long forms of the scope boundary. It was removed on
2026-08-03 and the framing now survives only as a one-line subtitle in the header. Nothing in
the test suite asserts that any scope text is rendered, so nothing will catch further
erosion. Given how central the "this is not a biology or medical model" framing is to the
project, restoring a fuller notice — and pinning it with a test — is the highest-value
accessibility and safety fix available.

**No 3D component is covered by a test.** The particle budget is verified as a pure function
and the scene legend is checked in the DOM, but no scene component is rendered in a test.

