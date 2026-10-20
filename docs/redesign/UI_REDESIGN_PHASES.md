# UI Redesign Phases

Branch: `feature/sketchup-ui` (from local `main` at 86ff585 + research docs). Spec: [UI_REDESIGN_SPEC.md](UI_REDESIGN_SPEC.md). Visual reference: `docs/design/sketchup-redesign/layout-mockup-v3.html`.

Rules
- One phase at a time; commit at the end of each phase (more commits inside a phase are fine). Do not push.
- At the start of a phase: re-read the spec section(s) listed and open the mockup.
- The app must stay usable after every phase. A feature may be temporarily housed somewhere "wrong" (marked TEMP below) but must never disappear.
- After a phase: `npx tsc --noEmit`, `npm run build`, browser check of the acceptance list, then update the status here.
- The user reviews after Phase 1 before Phase 2 starts.

Status: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 1 — Shell and relocation `[x]`

Goal: the new screen structure (spec §2) with every existing feature moved into its new container. Behaviour of the features themselves does not change yet.

Scope
- `index.html`: replace the 3-column editor (`#ui-left`, `#header`, `#ui-right`) with: canvas region + floating file pill, view switch, account placeholders, tool rail, panel tray, panel column, scene drawer, and a status bar.
- Load IBM Plex Sans KR / Mono; add the mockup tokens for chrome (light + dark).
- File pill: ☰ menu (작업 공간 바꾸기, 불러오기, 저장), file name (display), undo/redo buttons, save state text.
- View switch wired to the existing 2D/3D toggle.
- Tool rail: only `선택` for now (Phase 2 adds the rest).
- Tray + panel column with one-open-at-a-time behaviour. Panels host the existing DOM so existing modules keep working:
  - 보기: the four 2D toggles.
  - 레이어: reference-layer toggles + the scene background image controls.
  - 채널 검사: the patch grid (always expanded).
  - 공연장 정보: stage width/depth, actor height, default Z inputs.
  - 선택한 객체 속성: the current fixture property panel (TEMP: still contains everything) + the probe panel (TEMP).
  - 무대 위 목록: the fixture list with its type select + 추가 (TEMP until Phase 2) and the set panel (TEMP until Phase 2/4).
- Scene drawer: collapsed bar with current scene name and count; expands to show the existing scene list and 추가 button (TEMP styling until Phase 5).
- Status bar: hint for the Select tool, zoom out / zoom % (click = fit) / zoom in.
- 2D fit uses the chrome insets (spec §2).

Acceptance
- No left/right sidebar or header remains; the canvas fills the editor.
- Every feature from the old UI is reachable (scenes, fixtures add/edit, sets, probe, patch, toggles, layers, background image, stage settings, file load/save, undo/redo, 2D/3D).
- Opening a tray panel closes the previous one; the stage plan is not hidden under the rail or tray at default zoom.
- Typecheck and build pass; no console errors.

Done notes
- New files: `src/ui/shell.ts` (tray, file menu, 2D/3D switch, undo/redo buttons, scene drawer, zoom %), `src/ui/shell.css` (chrome tokens and layout).
- `canvas.ts`: `fitFrame()` fits the plan inside the chrome insets; `getViewZoom()` / `onViewChange()` feed the zoom %.
- Deferred on purpose: chrome dark theme (Phase 7); save-state dirty tracking and file rename (Phase 6).
- Follow-ups before Phase 2 (user requests): 2D light drawn as a photometric gradient; 보기 renamed 빛 범위 표시 with an (i) beam/field tip; defaults floor + face + field on, beam off; new tray panel 3D 극장 구조 (3D only) replaces the checkboxes in the 3D overlay, defaults catwalk off and structure/seating/work light on.

## Phase 2 — Tools `[x]`

Spec §3, §4 (placement parts).
- Tool state (UI-only), rail with 9 tools, separators, key shortcuts, disabled in 3D except Select.
- Ellipsoidal lens flyout (19/26/36/50/줌) beside the button; last lens remembered.
- Placement on stage click: fixtures snap to the nearest catwalk pipe; sets from presets (wall/deck/apple) or rectangle drag (set); per-kind naming; return to Select; select the new object and open its panel.
- Remove the TEMP add controls (fixture type select + 추가, + 세트 추가).
- Cursor shows crosshair for placing tools; status-bar hint follows the tool.

Done notes
- `src/ui/tools.ts` owns the tool state, rail rendering (incl. lens flyout), shortcuts (Space/E/F/P/R/W/D/B, Esc → Select) and placement; `canvas.ts` forwards mouse input to `toolPointerDown/Move/Up` when a non-Select tool is active and draws the set-drag preview.
- Fixture aim on placement: 4 m toward the acting-area centre (`seating.y0 / 2` when the venue has seating, else stage centre).
- After placing: fixture → 선택한 객체 속성 opens; set → 무대 위 목록 opens (TEMP until Phase 3/4 moves set properties).
- `window.addFixture` / `window.addSetPiece` remain as unused globals (remove in Phase 7).

## Phase 3 — Selection and panels `[x]`

Spec §4, §5.
- Single selection (fixture | set | actor | none); remove Ctrl multi-select.
- 조명 설정 drop-down panel with exactly the five sections (기종·렌즈 incl. PAR rotation, 젤 grid, 디머, 셔터, 3D 그림자); slide animation only on first appearance.
- 선택한 객체 속성 rebuilt per selection type (fixture: 이름 editable, 채널, 위치, 조준점 numeric; set; actor with brightness + contributions).
- Canvas actor label `얼굴 N lux`.
- 무대 위 목록 tree (조명 / 세트 / 사람 모형) with select, hide, delete.
- Lamp choice moves to 공연장 정보. (The 3D overlay toggles already moved to the 3D 극장 구조 tray panel before Phase 2.)
- Panel exclusivity rules (spec §5.4). Remove the TEMP probe panel.
- Tray becomes an accordion: panels open inline under their tray item and push the others down; 조명 설정 opens at the top of the tray (spec §5.6). Remove the floating panel column.
- 3D 극장 구조 auto-opens on entering 3D, with a `3D로 들어갈 때 자동으로 열지 않기` checkbox stored in localStorage.

Done notes:
- New modules: `ui/selection.ts` (single selection + `onSelect` event, avoids shell↔canvas import cycles), `ui/lightSettings.ts`, `ui/properties.ts`, `ui/stageList.ts`. `ui/probe.ts` deleted; `ui/fixture.ts` and `ui/sets.ts` keep only data operations.
- Canvas hit order: selected fixture's aim point / shutter corners → fixture body → actor → set → empty (clear + pan). History is committed on the first drag move only.
- 3D: clicking a fixture body (< 4 px pointer travel) selects it via raycast on `userData.fixtureId`; pressing the actor selects it.
- Deleting the selected fixture now clears the selection (store no longer falls back to the first fixture).
- `selected_fixture_ids` still exists in state as a one-element mirror for the renderers; remove in Phase 7.
- Leftover CSS (`#probe-panel`, `.fixture-add-controls`, `.shutter-control`) is left for Phase 7 cleanup.

## Phase 4 — Set handles `[x]`

Spec §4 (set rows).
- Selected set shows 4 corner handles + yellow rotation handle (2D).
- Corner drag resizes with the opposite corner fixed (rotation-aware); rotation drag with 15° snapping; body drag moves.
- `SetPiece.kind`; set props show 종류 and mm values.

Done notes:
- `DragMode` gains `set-corner` and `set-rotate`. Handle hit-testing is in screen pixels (10 px), so handles stay grabbable at any zoom; the rotation stick is 26 px long.
- Corner drag: the opposite corner is stored at mousedown and the mouse vector is projected onto the set's local axes; sizes round to 10 mm, minimum 50 mm. Dragging past the fixed corner flips the side instead of going negative.
- Rotation snaps to the nearest 15° within ±3°, otherwise whole degrees; range (-180, 180].
- While resizing or rotating, a dark readout shows `W × D mm` or the angle. Hover cursors match the corner direction (rotation-aware) and `grab` on the rotation handle.
- `worldToScreen` is exported from `render/canvas.ts` (used by tests now, status bar coordinates in Phase 6).
- `SetPiece.kind` and mm fields were already done in Phases 2–3.

## Phase 5 — Scene drawer `[x]`

Spec §6.
- Card row with thumbnails, current highlight, drag reorder; 새 씬 / 복사 / 이름 변경 / 삭제 (in-page rename, no `prompt()`).
- Background image controls confirmed in 레이어 only.

Done notes:
- `ui/scene.ts` rewritten: no `window.*` globals, no inline styles, no `prompt()`. Buttons act on the current scene: 새 씬 (appended), 복사 (inserted right after, fixtures get new ids, name `… 복사본`), 이름 변경 (card name turns into an input; Enter/blur saves, Esc cancels; double-click on the current card's name also works), 삭제 (first click arms `한 번 더 누르면 삭제` for 3 s; disabled when only one scene is left). All are undoable.
- Cards: thumbnail (whole stage, `object-fit: contain` on the dark canvas colour), name, `조명 N개`; current card highlighted. HTML5 drag reorder with a before/after insert bar; the current scene stays current after reordering.
- Thumbnails now draw on `#1f2329` (light pools use screen blending and were invisible on the old `#bbb`). Scenes that were never edited since loading get a thumbnail when the drawer renders.
- The list only renders while the drawer is open; the drawer handle defers its render with `setTimeout` (a microtask ran before shell.ts toggled `hidden` on real clicks).
- Background image controls are rebuilt in the 레이어 panel (`#bg-settings-container`) with the panel styles; they re-render only when the background values change, so the opacity slider is not replaced mid-drag.
- Leftover `#cue-list .list-item` rules in `style.css` are left for Phase 7.

## Phase 6 — Status bar and top bar details `[x]`

Spec §7, §8.
- Live cursor coordinates (m); numeric input (VCB) for exact move distance and set height; zoom % display.
- 도우미 panel content per tool; help icon opens it.
- File name rename, save state (`저장 안 됨` / `저장됨`), ☰ "다른 이름으로 저장".

Done notes:
- New `ui/statusbar.ts`: cursor position from canvas `mousemove` (`X —  Y —` off-canvas and in 3D). VCB context is the last action: after/while dragging a fixture, set or actor → `거리` (Enter re-applies the move from the drag start along the drag direction at exactly that distance; ends an in-progress drag); right after placing/drawing a set → `높이`. Units: plain number = m, or `mm` / `cm` suffix. Digits typed anywhere (not in an input) go into the VCB while a context exists, SketchUp-style. Invalid input gets a red border.
- New `ui/help.ts`: 도우미 tray panel (선택한 것 group, under 선택한 객체 속성) shows the current tool name + key, hint, "다음에 일어나는 일" and a shortcut list; follows tool / lens / 2D-3D changes via `onToolChange`. The `?` button at the left of the status bar toggles it.
- Top bar: file name is a button; clicking turns it into an inline input (Enter saves the name, Esc cancels, blur keeps the name). ☰ 저장 / Ctrl+S download `<name>.json` directly; without a name they open the name input first. ☰ 다른 이름으로 저장 always asks. `prompt()` is gone from saving.
- Save state: store `onEdit` fires on `commitHistory` / undo / redo → `저장 안 됨 · 내 컴퓨터`; saving or loading → `저장됨 · 내 컴퓨터`; new work → `내 컴퓨터`. 작업 공간 바꾸기 only asks for confirmation when there are unsaved changes.
- Stage size inputs in 공연장 정보 now commit history (they were not undoable before).

## Phase 7 — Visual polish and cleanup `[ ]`

- Match mockup visuals (icons, spacing, light canvas look for the 2D plan if it reads better), dark theme check.
- Remove dead code (old sidebars' CSS, multi-select remnants, unused globals), update `README`/docs, final build and full regression pass in 2D and 3D.
