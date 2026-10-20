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

## Phase 1 — Shell and relocation `[~]`

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

## Phase 2 — Tools `[ ]`

Spec §3, §4 (placement parts).
- Tool state (UI-only), rail with 9 tools, separators, key shortcuts, disabled in 3D except Select.
- Ellipsoidal lens flyout (19/26/36/50/줌) beside the button; last lens remembered.
- Placement on stage click: fixtures snap to the nearest catwalk pipe; sets from presets (wall/deck/apple) or rectangle drag (set); per-kind naming; return to Select; select the new object and open its panel.
- Remove the TEMP add controls (fixture type select + 추가, + 세트 추가).
- Cursor shows crosshair for placing tools; status-bar hint follows the tool.

## Phase 3 — Selection and panels `[ ]`

Spec §4, §5.
- Single selection (fixture | set | actor | none); remove Ctrl multi-select.
- 조명 설정 drop-down panel with exactly the five sections (기종·렌즈 incl. PAR rotation, 젤 grid, 디머, 셔터, 3D 그림자); slide animation only on first appearance.
- 선택한 객체 속성 rebuilt per selection type (fixture: 이름 editable, 채널, 위치, 조준점 numeric; set; actor with brightness + contributions).
- Canvas actor label `얼굴 N lux`.
- 무대 위 목록 tree (조명 / 세트 / 사람 모형) with select, hide, delete.
- Lamp choice moves to 공연장 정보; 3D overlay toggles move to 보기.
- Panel exclusivity rules (spec §5.4). Remove the TEMP probe panel.

## Phase 4 — Set handles `[ ]`

Spec §4 (set rows).
- Selected set shows 4 corner handles + yellow rotation handle (2D).
- Corner drag resizes with the opposite corner fixed (rotation-aware); rotation drag with 15° snapping; body drag moves.
- `SetPiece.kind`; set props show 종류 and mm values.

## Phase 5 — Scene drawer `[ ]`

Spec §6.
- Card row with thumbnails, current highlight, drag reorder; 새 씬 / 복사 / 이름 변경 / 삭제 (in-page rename, no `prompt()`).
- Background image controls confirmed in 레이어 only.

## Phase 6 — Status bar and top bar details `[ ]`

Spec §7, §8.
- Live cursor coordinates (m); numeric input (VCB) for exact move distance and set height; zoom % display.
- 도우미 panel content per tool; help icon opens it.
- File name rename, save state (`저장 안 됨` / `저장됨`), ☰ "다른 이름으로 저장".

## Phase 7 — Visual polish and cleanup `[ ]`

- Match mockup visuals (icons, spacing, light canvas look for the 2D plan if it reads better), dark theme check.
- Remove dead code (old sidebars' CSS, multi-select remnants, unused globals), update `README`/docs, final build and full regression pass in 2D and 3D.
