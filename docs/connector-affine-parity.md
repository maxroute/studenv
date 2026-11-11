# Connector System — AFFiNE Edgeless Parity Analysis

Status: **investigation complete, awaiting review before implementation.**

## 1. Reference inspected

| Item | Value |
|---|---|
| Upstream repo | `toeverything/AFFiNE`, branch `canary` |
| Commit | `e2767cb27186a344c5d14f1d1643caf50f638988` (2026-11-10) |
| App version (`package.json`) | `0.27.5` |
| Live app | `https://app.affine.pro`, local (browser-only) demo workspace, Edgeless mode, 2026-11-12 |
| Licence | BlockSuite packages under `blocksuite/` are **MIT** (`LICENSE-MIT`, package `"license": "MIT"`). Studenv will re-implement behaviour in its own code; no source is copied. |

Primary sources read (paths relative to `blocksuite/affine/`):

- `model/src/elements/connector/connector.ts` — data model, hit testing, label offsets
- `model/src/consts/connector.ts`, `consts/line.ts`, `consts/note.ts` — modes, endpoint styles, widths, stroke styles
- `gfx/connector/src/connector-manager.ts` — anchors, target detection overlay, straight/curve/orthogonal path generation (A*)
- `gfx/connector/src/connector-tool.ts` — drag-create and quick-connect tool
- `gfx/connector/src/components/connector-handle.ts` — endpoint handles for a selected connector
- `gfx/connector/src/connector-watcher.ts` — live path recomputation
- `gfx/connector/src/view/view.ts` — connector drag, label drag/dblclick, resize/rotate
- `gfx/connector/src/renderer/{element-renderer,utils}.ts` — line, dash, endpoint shapes, label clipping
- `gfx/connector/src/text/edgeless-connector-label-editor.ts` — label editing
- `gfx/connector/src/toolbar/config.ts` — connector toolbar
- `gfx/connector/src/element-transform/connector-filter.ts` — drag filtering
- `widgets/edgeless-selected-rect/src/edgeless-auto-complete.ts`, `utils.ts` — auto-complete arrows
- `blocks/root/src/edgeless/edgeless-keyboard.ts`, `configs/toolbar/misc.ts` — `C` shortcut, quick connect
- `blocks/surface/src/extensions/crud-extension.ts`, `commands/reassociate-connectors.ts` — delete/reassociate

Live-app evidence (screenshots saved in this session's tool-results folder):

| # | Evidence | File |
|---|---|---|
| E1 | Selected shape: blue outline, 4 corner handles, 4 grey auto-complete arrows outside each side, element toolbar with connector button | `mcp-Claude_Browser-blob-1794431463759-fhniks.jpg` |
| E2 | Hovering an auto-complete arrow: arrow turns filled blue; after ~300 ms a dashed ghost shape + dashed elbow connector preview appear 100 px away | `mcp-Claude_Browser-blob-1794431484293-5cw28t.jpg` |
| E3 | Dragging from the arrow over an ellipse: 4 anchor dots on the **ellipse outline**, nearest anchor filled blue, preview snaps to it | `mcp-Claude_Browser-blob-1794431495682-2px3j5.jpg`, `…1794431500237-z51usd.png` |
| E4 | Selected connector: two endpoint handles, no bounding box; toolbar = stroke colour · start style · flip · end style · shape · add text · lock · more | `mcp-Claude_Browser-blob-1794431517491-9dui65.jpg` |
| E5 | Shape dropdown: Curve / Elbowed / Straight | `mcp-Claude_Browser-blob-1794431529369-2ejdpf.png` |
| E6 | Elbowed routing H‑V‑H with mid-gap bend | `mcp-Claude_Browser-blob-1794431541037-1ov8y6.jpg` |
| E7 | Label editing (blue-bordered editor) and committed label with the line cut around it | `mcp-Claude_Browser-blob-1794431571429-t483e1.png`, `…-zls2ac.png` |
| E8 | Endpoint drag: free point over empty canvas; over a triangle the 4 anchors sit on the **triangle outline** and snap | `mcp-Claude_Browser-blob-1794431595366-4e2baw.jpg`, `…1794431595498-4ntoqi.jpg` |

Live measurements (from the running app's own model):

- Auto-complete drag result: `mode = Curve (2)`, `stroke #929292`, `strokeWidth 2`, `strokeStyle solid`, `front None`, `rear Arrow`, `source {id, position:[1,0.5]}`, `target {id, position:[0,0.5]}`.
- Elbowed path after moving the target down 160: `[148,-137] → [318,-137] → [318,23] → [488,23]`.
- Curve control handles: `out = [113, 0]` / `in = [-113, 0]` (max(100, projection/3)).
- Endpoint handles: 12 × 12 px, 2 px `#1E96EB` border, background = canvas, `cursor: pointer`, `touch-action: none`.
- `C` key → connector tool, cursor `crosshair`, mode Curve. Drag on empty canvas creates a connector with two free endpoints, then the tool returns to Select with the new connector selected.
- Endpoint drag → one undo step restores the previous attachment.
- Mobile web (375 px): AFFiNE shows an "Open in app" card over the desktop editor; there is **no mobile-specific connector UX** in BlockSuite (only `touch-action: none`). AFFiNE's dedicated mobile apps were not inspected.

## 2. Confirmed vs. unconfirmed

**Confirmed in source and observed live:** auto-complete arrows; ghost preview; drag-to-connect with shape-aware anchors; nearest-anchor snapping; free endpoints; three modes; endpoint handles with reattach/detach; toolbar contents; labels; `C` shortcut; default Curve; undo of an endpoint drag.

**Confirmed in source only (not exercised live):** quick connect from toolbar button; mode cycling by pressing `C` again; auto-complete click creating the next shape; auto-complete panel on drop in empty space; label drag along path; connector-filter drag rule; resize/rotate of free connectors; text style actions on labels; rough/"scribbled" style (behind feature flag `enable_edgeless_scribbled_style`).

**Not present in current AFFiNE (do not implement as "parity"):** manual waypoints / draggable elbow segments; draggable curve control points; routing around third-party obstacles (orthogonal A* only avoids the two endpoint objects); per-connector hover highlight; dotted stroke style (only solid / dash); long-press on touch.

## 3. Feature-parity matrix

Priority: **R** = required for parity, **O** = optional / AFFiNE-flagged, **N/A** = not in AFFiNE.

### A. Discovering connection points

| # | AFFiNE behaviour | Evidence | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|---|
| A1 | Selecting a **shape or note** shows 4 auto-complete arrows (24 px circles in a 72×44 hit area) 22 px outside each side, rotated with the selection; hidden while dragging. | E1; `edgeless-auto-complete.ts` `_renderArrow` | 4 blue 14 px dots **on** the edge midpoints for every connectable type | Different affordance, position, size, styling, and type scope | Replace v1 handles with an `AutoCompleteArrows` overlay positioned in screen space outside the selection frame (rotation-aware); 24 px visual / ≥44 px touch target | Unit: arrow positions for 0/45/90/180°; Browser: arrows at all zooms, hidden during drag | R |
| A2 | Arrow hover: wrapper hover = white bg + border + shadow; arrow hover = primary blue fill, white icon | E2; CSS in same file | none | Missing | Tailwind classes on the arrow component | Browser screenshot | R |
| A3 | Arrow hover 300 ms → ghost of the next shape (same shape type, 100 px gap, avoiding overlap with connected shapes) + dashed elbow preview | E2; `_showNextShape`, `nextBound` | none | Missing | Ghost render in connectors layer from shared `nextBound` + orthogonal router | Unit: `nextBound` gaps/overlap avoidance; Browser: preview after 300 ms, cleared on leave | R |
| A4 | During a connection drag, every connectable element whose rotated bound (expanded 10) contains the pointer shows its 4 anchors as white dots with accent stroke (r = 5 screen px, 60 % alpha); the chosen anchor is filled accent | E3, E8; `ConnectionOverlay.render` | only the final target dot | Missing anchor dots on candidates | `ConnectionOverlay` component fed by pure `findConnectionTarget()` | Unit + Browser | R |
| A5 | Anchors are **shape-aware**: ray from centre to each side midpoint (+10) intersected with the element's real outline; triangles use `[0.75,0.5]`/`[0.25,0.5]` for side anchors | E3, E8; `getAnchors`, `ConnectorEndpointLocationsOnTriangle` | rectangle midpoints for every type | Wrong for ellipse/circle/diamond/triangle/hexagon/pentagon/star | `getShapeOutline(kind, w, h)` polygon/ellipse from `shape-paths` geometry; `getAnchors(item)` = ray-outline intersections, rotation-aware | Unit per shape kind × rotation | R |
| A6 | Each anchor carries a **tangent** (outward normal rotated) used by curve and arrowhead orientation | `getConnectableRelativePosition` | none | Missing | `PointLocation`-like `{x,y,tangent}` in geometry module | Unit | R |
| A7 | Touch: no special mode; drag works via pointer events with `touch-action: none` | source grep | handles have `touch-none` | Equivalent; but hover-only features (A2/A3) unavailable on touch | Keep pointer-event path; ensure ≥44 px touch targets | Browser (mobile emulation) | R |

### B. Creating connectors

| # | AFFiNE behaviour | Evidence | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|---|
| B1 | Drag from an auto-complete arrow: connector is created once the pointer moves > 8 world px, source `{id, position: side}`; target follows `findConnectionTarget`; toolbar hidden while dragging | E3; `_onPointerDown` | drag from dot, 4 px screen threshold | Threshold units & toolbar hiding | Shared connection-drag state machine (`idle → pending → dragging → committed/cancelled`) | Unit state machine; Browser | R |
| B2 | Target rules: within **8 screen px** of an anchor → that anchor; else within **8 world px** of the outline → exact outline point (relative, clamped); else (pointer inside expanded bound) → **nearest anchor**; nothing nearby → free point | `renderConnector` | nearest of 4 midpoints within 28 px screen; otherwise no target | Missing outline attachment, inside-object snapping, free endpoints | Pure `findConnectionTarget(point, items, zoom, excludeIds)` | Unit for every branch, rotated targets, zoom 0.1/1/5 | R |
| B3 | Release on empty canvas after dragging from an auto-complete arrow → **auto-complete panel** to create shape/text/note/frame at the drop point, connected | `_createAutoCompletePanel` | release = cancel, nothing created | Missing | Small picker for Studenv equivalents (shape kinds, sticky, free-text) | Browser | R |
| B4 | Click (no drag) on an auto-complete arrow → create the next shape at `nextBound`, connect side→opposite side, enter text editing | `_generateElementOnClick` | none | Missing | Reuse A3 geometry + `addItem` + connector | Unit + Browser | R |
| B5 | Connector **tool** (toolbar + `C`): drag anywhere; start on an element attaches source (B2 rules), start on empty = free start; after release the tool returns to Select with the connector selected | live `C` test; `connector-tool.ts` | no connector tool | Missing | Add tool to toolbar and shortcut map | Browser | R |
| B6 | Pressing `C` while the connector tool is active cycles Curve → Elbowed → Straight; last-used mode remembered | `edgeless-keyboard.ts` | none | Missing | Tool mode state + persisted "last props" | Unit/Browser | R |
| B7 | Quick connect from the element toolbar's connector button: connector follows the pointer without dragging; click on a target commits; click on empty cancels (deletes the pending connector) | `misc.ts`, `quickConnect` | none | Missing | Same state machine, "quick" variant | Browser | R |
| B8 | Escape / tool change during creation cancels; pointer-cancel ends gesture | `deactivate`, `_allowCancel` | pointercancel clears drag | Escape not handled | Keyboard handler in state machine | Unit + Browser | R |

### C. Endpoint attachment and geometry

| # | AFFiNE behaviour | Evidence | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|---|
| C1 | Endpoint = `{id?, position?}`; with `id`, `position` is **relative [0..1]** in the element's unrotated bound (rotation applied at compute time); without `id`, absolute world point | `connector.ts` | `{sourceId, sourceAnchor: top/right/bottom/left}` | Model cannot express outline points or free ends | New schema `source/target: {id?, position?}`; **backward-compatible parse** of v1 props (`anchor → relative position`) | Unit: v1 → v2 migration, serialization round trip | R |
| C2 | `id` without `position` = dynamic anchor: nearest anchor to the other end, recomputed on movement | `_getConnectionPoint` | none | Missing (rarely produced in UI) | Support in resolver | Unit | O |
| C3 | Paths recompute when an endpoint element's `xywh` or `rotate` changes, batched per microtask | `connector-watcher.ts` | recomputed every render from items | Equivalent result; derived per render | Keep derived rendering (memoised per connector) | Unit + Browser | R |
| C4 | Resize/rotate of an endpoint element keeps the relative attachment (point moves with the outline) | C1 semantics | anchors move with object | Equivalent once C1 lands | — | Unit | R |
| C5 | Deleting an element deletes its attached connectors | `crud-extension.ts` | same | None | — | Existing lifecycle tests | R |
| C6 | Dragging selection: a connector whose attached element is not in the selection is excluded from the drag; free endpoints move with `moveTo`; label moves with connector | `connector-filter.ts`, `moveTo` | connectors not draggable | Missing for free-ended connectors | Include connectors in drag only when bindings are selected | Unit + Browser | R |
| C7 | Copy/duplicate keeps connections only when both bound ends are included; ids remapped | `isConnectorAndBindingsAllSelected` | same (v1 tests) | Extend to free ends (free ends are always copyable) | Update clipboard/duplicate to v2 model | Unit | R |
| C8 | Groups are connectable targets (target group shows dashed bound) | `renderConnector` group branch | Studenv groups not connectable | Different (Studenv group UX differs) | Defer; decide with review | — | O |

### D. Connector types and routing

| # | AFFiNE behaviour | Evidence | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|---|
| D1 | Three modes: **Curve (default)**, Elbowed (orthogonal), Straight | E5; `consts/connector.ts` | Straight only | Missing 2 modes; default differs | `mode` field (default Curve); renderer per mode | Unit + Browser | R |
| D2 | Straight between two `id`-only ends uses nearest anchors to each other's centre; otherwise the stored points | `_generateStraightConnectorPath` | stored anchors | Equivalent for UI-created connectors | Resolver | Unit | R |
| D3 | Curve = one cubic Bézier; control vectors perpendicular to each attached anchor's tangent, length `max(100, |projection|/3)`; free ends use 2/3 of dominant-axis delta | E6 data; `_generateCurveConnectorPath` | none | Missing | `getCurvePath()` | Unit: control vectors per side; Browser | R |
| D4 | Elbowed = A* over candidate points (expanded bounds by 20, gap midpoints, outer points), avoiding the two endpoint bounds; merged collinear points; direct path when bounds overlap | E6; `PathGenerator`, `AStarRunner` | none | Missing | Port the **algorithm** (own implementation) into `lib/workspace/connector-routing.ts` | Unit: side combinations, overlap, rotated ends, free ends | R |
| D5 | Routing does not avoid other objects; no manual waypoints | source | — | — | Match (do not add) | — | N/A |

### E. Connector editing

| # | AFFiNE behaviour | Evidence | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|---|
| E1 | Click on the path (within `8 + strokeWidth/2` world px) or label selects the connector; box-select includes connectors whose path points are inside | `includesPoint`, `containsBound` | not selectable | Missing | Hit testing in pointer pipeline + marquee | Unit hit tests; Browser | R |
| E2 | Selected connector: two 12 px endpoint handles (2 px accent border), no bounding box, no resize handles unless selected with both bound ends | E4; `connector-handle.ts`, `ConnectorInteraction` | — | Missing | `ConnectorEndpointHandles` overlay | Browser | R |
| E3 | Dragging an endpoint handle re-runs target detection: reattach to another element / anchor / outline point, or detach to a free point; one undo step | E8; live undo test | — | Missing | Same `findConnectionTarget`; single history entry per gesture | Unit + Browser | R |
| E4 | Delete/Backspace deletes selected connectors; Escape deselects | standard edgeless selection | — | Missing | Selection integration | Browser | R |
| E5 | Flip direction swaps start/end **styles** only (geometry unchanged) | `config.ts` flip | — | Missing | Toolbar action | Unit | R |
| E6 | Undo/redo for create, reattach, style, mode, label | live undo | Studenv has **no workspace undo/redo** (only drawing toolbar) | Missing infrastructure | See decision D-1 | Unit + Browser | R |

### F. Appearance and styling

| # | AFFiNE behaviour | Evidence | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|---|
| F1 | Toolbar for selected connector(s): stroke colour panel (palette + line width 2/4/6/8/10/12 + stroke style solid/dash), start style ▾, flip, end style ▾, shape ▾, add text, (lock, more) | E4, E5; `config.ts` | none | Missing | `ConnectorStyleToolbar` modelled on `ShapeStyleToolbar` | Browser | R |
| F2 | Endpoint styles: None, Arrow (open, ±45°, size 15·w/2), Triangle (filled, ±30°, 15·w/2), Circle (filled r 5·w/2), Diamond (filled 10·w/2); defaults front **None**, rear **Arrow** | `renderer/utils.ts` | filled arrowhead only | Missing 4 styles + start style | Pure `getEndpointShape(style, point, tangent, w)` → SVG path | Unit per style; Browser | R |
| F3 | Dash = `[12, 12]`; round caps/joins | `element-renderer.ts` | solid | Missing dash | SVG `stroke-dasharray` | Browser | R |
| F4 | Defaults for new connectors come from last-used props (observed: grey `#929292`, width 2, solid, Curve) | live data; `EditPropsStore` | fixed `#64748b`, 2 | Last-used memory missing | Per-user last-props in local storage | Unit | R |
| F5 | Multi-select: toolbar edits apply to every selected connector; controls show the most common value | `getMostCommonValue` | — | Missing | Toolbar operates on selection | Browser | R |
| F6 | Rough / scribbled style | flagged | — | — | Skip unless requested | — | O |

### G. Labels

| # | AFFiNE behaviour | Evidence | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|---|
| G1 | "Add text" toolbar button or double-click on a connector opens a label editor at the clicked point projected onto the path; Escape or Cmd+Enter exits; empty text removes the label | E7; label editor | none | Missing | `ConnectorLabelEditor` (contentEditable/textarea in world layer) | Browser | R |
| G2 | Label stored as `text`, `labelOffset.distance` (0..1 along path), `labelXYWH`, `labelStyle` (Inter 16, centered), max width 280 | `connector.ts` | — | Missing | Schema fields | Unit serialization | R |
| G3 | Line is cut around the label (even-odd clip with 3 px padding) | E7; `element-renderer.ts` | — | Missing | SVG mask | Browser | R |
| G4 | Dragging a label slides it along the path (nearest point → new distance); label follows path changes | `view.ts` | — | Missing | Pure `pointAtDistance` / `distanceAtPoint` per mode | Unit per mode | R |
| G5 | Label text style controls (font, size, weight, colour, alignment) | `createTextActions` | — | Missing | Reuse Studenv text toolbar controls | Browser | O |

### H. Lifecycle and data integrity

| # | AFFiNE behaviour | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|
| H1 | Serialize/reload keeps source/target/mode/styles/label | v1 props only | New fields | v2 schema + v1 migration in `parseWorkspaceSceneJson` | Unit round trip; reload in browser | R |
| H2 | Missing endpoint element → path not updated (connector kept but stale) | dropped from render | Studenv already safer | Keep: render nothing for missing bound ends; free ends still render | Unit | R |
| H3 | Undo/redo across all connector operations | none | see D-1 | — | — | R |
| H4 | Copy/paste/duplicate/cut | v1 implemented | extend to v2 | — | Unit | R |

### I. Input and responsive

| # | AFFiNE behaviour | Studenv now | Gap | Implementation | Tests | P |
|---|---|---|---|---|---|---|
| I1 | Pointer Events throughout, `touch-action: none` on handles | yes | — | Keep | — | R |
| I2 | Screen-space snap radius (8 px) and handle sizes independent of zoom | 28 px snap, 14 px world-scaled dot | Handle size scales with zoom | Screen-space sizing (divide by zoom) | Browser at 0.1/1/5 | R |
| I3 | Mobile: no dedicated UX | — | Studenv must stay usable on touch (product requirement) | ≥44 px touch hit areas for arrows/handles; no hover dependence for core actions | Browser mobile emulation; manual device check | R |

## 4. Decisions needed before implementation

- **D-1 Undo/redo.** AFFiNE parity needs undo/redo; Studenv has no workspace-level history today (only the drawing toolbar's local stack). Options: (a) add a general workspace history (snapshot-based, `Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z`) covering all item mutations — benefits every tool but is a larger cross-cutting change; (b) connector-only history — inconsistent UX. **Recommendation: (a)** as its own stage.
- **D-2 Discovery affordance.** Parity means replacing the v1 on-edge blue dots with AFFiNE-style auto-complete arrows outside the selection (shapes + notes in AFFiNE). For Studenv, which types get arrows? **Recommendation:** shapes and sticky notes (AFFiNE: shapes + notes); every connectable type remains a valid *target* and can still start connectors via the connector tool / quick connect.
- **D-3 Default mode.** AFFiNE defaults to **Curve**. Recommendation: match.
- **D-4 Existing saved connectors.** v1 connectors on Preview will be migrated on load (`anchor → relative position`, mode Straight to keep their look). No database migration — scene JSON is normalised at parse time.
- **D-5 Groups as targets** (C8) and **rough style** (F6): recommend deferring.

## 5. Implementation stages (revised after investigation)

1. **Core model & geometry** — v2 connector schema + v1 migration; shape-aware anchors with tangents (all Studenv shape kinds, rotation); target detection rules (B2); straight / curve / orthogonal (A*) routing; endpoint shapes; path sampling for labels. Pure modules + unit tests.
2. **Rendering** — connectors layer renders all modes, endpoint styles, dash, labels with clipping; screen-space overlay for candidate anchors.
3. **Creation** — auto-complete arrows (hover, ghost, click-create, drag, drop panel), connector tool + `C` + mode cycling, quick connect, Escape/cancel. Remove v1 on-edge dots.
4. **Selection & editing** — hit testing, marquee, endpoint handles with reattach/detach, delete, drag rules for free connectors.
5. **Toolbar & labels** — style toolbar (colour, width, dash, start/end style, flip, mode, add text), multi-select editing, last-used defaults, label editor and drag.
6. **History & lifecycle** — workspace undo/redo (per D-1), clipboard/duplicate on v2, reload integrity.
7. **Parity verification** — side-by-side AFFiNE vs Studenv scenarios (§3) on desktop and mobile emulation; regression suites; build.

Each stage is a separate commit on `feat/workspace-smart-connectors-v2` with a stage report.
