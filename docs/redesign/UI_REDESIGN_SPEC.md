# UI Redesign Spec (SketchUp Web style)

Status: approved direction (2026-10-20). Implementation plan: [UI_REDESIGN_PHASES.md](UI_REDESIGN_PHASES.md).

## 0. Sources of truth

1. **This spec** — decisions the user made while reviewing three mockup rounds. Wins on any conflict.
2. **Layout mockup v3** — `docs/design/sketchup-redesign/layout-mockup-v3.html` (open it directly in a browser; also published at https://claude.ai/artifact/JbwFQ9CpUERKJXV8kE6ZKs, version 3).
   Treat it as the visual and interaction reference: positions, sizes, colors, panel contents, Korean copy, and the "what happens on click" explanations printed in its console. When a detail is not in this spec, copy the mockup. **Open the mockup at the start of every phase.**
3. Research background: `docs/research/01-sketchup-web-left-right-layout.md` (left = verbs/tools, right = nouns/panels).

The mockup is a fake: it does not compute light. All real behaviour comes from the existing engine (`src/engine/*`, `src/render/*`). The redesign changes **where** things live and **how** they are triggered, not the lighting model.

## 1. Principles

- Audience: a student theatre club. Ease of use beats completeness.
- Canvas first: the stage fills the window; all chrome floats over it (SketchUp Web).
- **The Select tool does everything it can.** A tool exists only for actions Select cannot do (creating things). Aim points, shutters, rotation, pan and 3D orbit are all Select-tool drags, never separate tools.
- **Single selection only.** Multi-select (Ctrl+click) is removed.
- After placing a fixture or set, the active tool returns to Select automatically.
- Floating panels never overlap each other (see §5.4).
- All UI copy is Korean, in full sentences where it is a sentence (match the mockup wording).

## 2. Screen regions

Positions are from the mockup CSS (px, relative to the editor area).

| Region | Position | Contents |
|---|---|---|
| Canvas | fills the editor area above the status bar | 2D plan (`#stageCanvas`) or 3D view (`#view3d`) |
| File pill | top-left, `top:10 left:10` | menu ☰, file name, undo, redo, save state |
| View switch | top-center, `top:10` | segmented `2D 평면` / `3D 보기` |
| Account | top-right, `top:10 right:10` | `로그인`, `공유` — disabled placeholders (future cloud features) |
| Tool rail | left, `top:58 left:10 width:46` | 8 tools (§3) |
| Panel tray | right, `top:58 right:10` | icon + label buttons in two groups (§5) |
| Panel column | `top:58 right:196 width:300 bottom:64` | open floating panels, stacked vertically |
| Scene drawer | bottom, `left:70 right:510 bottom:10` | collapsed bar; expands upward (§6) |
| Status bar | full-width row under the canvas | hint, cursor coords, numeric input, zoom (§7) |

The old three-column layout (left sidebar, header, right sidebar) is removed entirely. The landing screen (venue picker) stays as is.

The 2D plan must fit inside the area not covered by chrome: use insets of about `left 70, right 200, top 56, bottom 64` when computing the fit scale.

## 3. Tools (left rail)

Exactly one tool is active. Order and grouping (separators between groups):

| Group | Tool id | Label | Key | Behaviour |
|---|---|---|---|---|
| Select | `select` | 선택 | Space | Default. See §4. |
| Fixtures | `ellip` | 엘립소이달 놓기 | E | Clicking the button opens a **flyout right next to it** with `19° · 26° · 36° · 50° · 줌`. Choosing one arms the tool; clicking the stage places it. Key E arms it with the last-used lens without opening the flyout. |
| | `fresnel` | 프레넬 놓기 | F | Click stage → place S4 Fresnel. |
| | `par` | PAR 놓기 | P | Click stage → place PAR64 (default lamp MFL). |
| Sets | `set` | 세트 그리기 | R | Drag a rectangle → new set (default height 0.4 m; status-bar numeric input sets height). |
| | `wall` | 벽 놓기 | W | Click → set preset 1220 (W) × 30 (D) × 2440 (H) mm. |
| | `deck` | 덧마루 놓기 | D | Click → set preset 1800 × 900 × 150 mm. |
| | `apple` | 애플박스 놓기 | B | Click → set preset 450 × 300 × 150 mm. |

Notes
- Wall / 덧마루 / 애플박스 are **shortcuts of 세트 그리기**. They create ordinary set pieces; nothing else is special about them. They differ only in initial size and in their name prefix.
- Set naming: per-kind counters → `세트1`, `벽1`, `벽2`, `덧마루1`, `애플박스1`, … (counter = highest existing number of that prefix + 1).
- Fixture placement snaps to the nearest catwalk pipe (`model3d.catwalk.pipes`) when the venue has a 3D model; otherwise it uses the click position. Height = `stage_config.default_z`. Initial aim point: 4 m toward the stage centre (mockup uses `y - 4`), never off-stage.
- Lens flyout mapping to the existing data model: `19°/26°/36°/50°` → `type: 'ellipsoidal', lens_type: '19deg'|'26deg'|'36deg'|'51deg'`; `줌` → `type: 'zoom'` (default `zoom_range: 'narrow'`, angle chosen later in 조명 설정).
- After any placement: tool → `select`, the new object is selected, and its panel opens (fixture → 조명 설정; set → 선택한 객체 속성).
- 3D view: only `select` is enabled; the other tools are disabled (placing and drawing happen in 2D).
- Removed from the old UI: the right-sidebar "종류 select + 추가" fixture controls and the left "세트" panel's "+ 세트 추가".

## 4. Selection model and the Select tool

Selection is one of: a fixture, a set piece, the actor (probe), or nothing.

Select-tool interactions in 2D:

| Target | Click | Drag |
|---|---|---|
| Fixture body | select it, open 조명 설정 | move fixture |
| Aim point (blue dot of the selected fixture) | — | move aim point |
| Shutter corner (red, selected ellipsoidal with shutter on) | — | move that shutter corner |
| Set body | select it, open 선택한 객체 속성 | move set |
| Set corner handle (white circle, selected set) | — | resize, **opposite corner stays fixed** (PowerPoint-like), works on rotated sets |
| Set rotation handle (yellow circle on a stick above the top edge) | — | rotate around centre; snaps to multiples of 15° within ±3° |
| Actor | select it, open 선택한 객체 속성 (with brightness) | move actor |
| Empty floor | deselect, close 조명 설정 | pan the view |
| Wheel | — | zoom |

In 3D: click fixture → select + 조명 설정; drag actor → move; drag empty → orbit; wheel → zoom.

The actor always shows a small label on the 2D plan: `얼굴 642 lux` (live face illuminance from the probe calculation).

## 5. Right panels

### 5.1 Tray (top to bottom)

Order changed 2026-10-21 (user review of Phase 3): 선택한 것 comes first, and the object list moved to 작업 전체 as 객체 전체 목록.

| Group | Panel id | Label | Contents |
|---|---|---|---|
| 선택한 것 | `props` | 선택한 객체 속성 | depends on selection (§5.3). Bottom of the panel: checkbox `객체를 누를 때 자동으로 열지 않기` (§5.4). |
| | `help` | 도우미 | current tool's name, key, hint and what happens next. |
| 작업 전체 | `display` | 빛 범위 표시 | 2D light drawing only: 바닥에 닿는 빛 (gradient, default **on**), 배우 얼굴 높이에 닿는 빛 (default **on**), 각도선 with an (i) hover tip explaining beam (50 %) and field (10 %), 빔 각도선 (solid, default off), 필드 각도선 (dashed, default **on**). |
| | `venue3d` | 3D 극장 구조 | 3D only: 극장 구조 (default on), 캣워크 (default **off**), 객석 (on), 작업등 (on). The tray button is **disabled in 2D** and the panel closes when switching back to 2D. Separate from 빛 범위 표시 on purpose (user decision 2026-10-20). |
| | `layers` | 레이어 | 극장 평면도, 캣워크 오버레이 (visibility + opacity), 이 씬의 배경 이미지 (upload / position / size / opacity / delete). |
| | `patch` | 채널 검사 | channel usage grid with over-capacity warning (current patch panel, always expanded). |
| | `venue` | 공연장 정보 | 공연장 name, 무대 폭·깊이, 배우 얼굴 높이, 기본 조명 높이, 램프 규격 (HPL 575/750). |
| | `list` | 객체 전체 목록 | tree: 조명 (n), 세트 (n), 사람 모형. Click a row → select on stage. Per-row hide and delete. |

Removed panels (do not build): 젤 견본, 조명 기종, 밝기 측정.

### 5.2 조명 설정 (auto drop-down panel)

Not in the tray. It slides down at the top of the panel column **every time a fixture is selected** (click on stage, click in the list, or right after placing). It has a close button; it reappears on the next fixture selection. Animate the slide only when it newly appears, not on every re-render.

Contents (exactly these five):
1. **기종·렌즈** — ellipsoidal: lens 19/26/36/50 or zoom (+ zoom range/angle); fresnel: focus slider (좁게–넓게); PAR: lamp VNSP/NSP/MFL/WFL **and rotation angle**.
2. **젤** — current gel name + transmission, and a grid of the 11 venue gels plus "젤 없음" (one click applies).
3. **디머** — 0–100 % slider, with "실제 광량 약 N %" (square law) under it.
4. **셔터** — ellipsoidal: on/off (when on, red corners appear on the stage for the Select tool); fresnel/PAR: shown disabled with "이 기종에는 없음".
5. **3D 그림자** — on/off, max 4 fixtures (disable with a note when the limit is reached).

### 5.3 선택한 객체 속성

Title is always `선택한 객체 속성`.

- Fixture: 이름 (editable — new), 채널, 위치 X/Y/Z, 조준점 X/Y (numeric — new). Nothing else (the rest is in 조명 설정).
- Set: 종류 line (e.g. "세트 · 덧마루 바로가기로 만듦"), 이름, 중심 X/Y, 가로·깊이 (mm), 높이 (mm), 회전 (°), 색. Note: handles on stage change size and angle.
- Actor: 위치, 얼굴 높이 (= stage actor height, read-only here), 의상 색, then **이 자리의 밝기**: face lux (big), horizontal lux, the face light colour swatch, and per-fixture contributions (click → select that fixture). This replaces the old 밝기 Probe panel.
- Nothing selected: "무대에서 조명, 세트, 사람 모형 중 하나를 누르세요."

### 5.4 Panel exclusivity

- When 조명 설정 opens, close any tray panel.
- When a tray panel opens, collapse 조명 설정.
- Only one tray panel is open at a time; clicking its tray button again closes it.
- Selecting a set or the actor opens `props`, unless the user checked `객체를 누를 때 자동으로 열지 않기` in that panel (stored in `localStorage` key `lightingAid.propsNoAutoOpen`). The checkbox does not affect 조명 설정.
- Whenever something is selected and `props` is closed, the 선택한 객체 속성 tray icon is tinted (accent-soft fill, accent icon) so the user can see there is something to open.
- Nothing is selected on start-up or after switching scenes.

### 5.6 Tray as an accordion (decided 2026-10-21, implement in Phase 3)

SketchUp Web reference: `reference/sketchUp/cad_right_button_click.png` (the 태그 panel opens **in place** between 스타일 and 그림자).

- Clicking a tray item expands its panel **inline, right under that item, inside the tray column**. The items below it are pushed down; nothing floats beside the tray any more. The separate "panel column" (§2) goes away.
- The expanded panel is as wide as the panel cards (~300 px); the tray column widens while a panel is open and scrolls vertically if it does not fit.
- Still one panel open at a time (§5.4 rules unchanged). Clicking the item header again collapses it.
- 조명 설정 (§5.2) becomes an expanded section at the **top of the tray**, above the 선택한 것 group, pushing all items down; it still appears on every fixture selection and closes any other open panel.
- **3D 극장 구조 auto-opens when entering 3D view.** The panel shows a checkbox `3D로 들어갈 때 자동으로 열지 않기`; when checked, entering 3D no longer opens it. Store this preference in `localStorage` (per browser, not in project files; wrap access in try/catch).
- The 2D plan fit insets must account for the wider tray while a panel is open (or the plan simply stays under it — choose whichever keeps the stage readable).

### 5.5 2D light drawing (decided 2026-10-20, before Phase 2)

By default each fixture's floor light is a soft pool: a radial gradient over the field ellipse that follows the photometric falloff `10^(-r^p)` (100 % centre → 50 % at the beam angle → 10 % at the field angle, continuing slightly past it), tinted by the gel colour, scaled by the dimmer, clipped by shutters, composited with `screen`. Default visible: floor gradient, face-height area, field outline (dashed). The beam outline is opt-in in 빛 범위 표시. Panel names were chosen to be self-explanatory to newcomers (`보기` was too vague).

## 6. Scene drawer (bottom)

- Collapsed: a thin floating bar `▲ 씬  <current scene name>  · N개 · 누르면 목록이 올라옴`.
- Expanded: a horizontal row of scene cards (thumbnail, name, fixture count; current one highlighted) and buttons `＋ 새 씬`, `복사`, `이름 변경`, `삭제`. Cards are drag-reorderable. Clicking the bar again collapses it.
- The left-sidebar scene list and the canvas-top scene tabs are not used.
- Scene background images live in the 레이어 panel, not here.

## 7. Status bar

Left to right: help icon (opens 도우미), **hint sentence for the current tool** (mockup copy), cursor position `X 6.20 m  Y 7.45 m`, numeric input `수치` (SketchUp VCB: while dragging, typing a number and Enter applies an exact distance; right after drawing a set it sets the height), zoom `100%` (click → fit). Zoom in/out also via wheel.

VCB details (implemented in Phase 6): the field label reads `거리` after a move and `높이` after placing a set, `수치` otherwise. Values are metres unless suffixed `mm` or `cm`. Typing digits anywhere outside an input jumps into the field while it has a target. A move is re-applied from the drag start along the drag direction.

## 8. Top bar details

- ☰ menu: 작업 공간 바꾸기 (back to landing), 불러오기, 저장, 다른 이름으로 저장.
- File name: shows the loaded/saved file name (or `이름 없는 작업`); click to rename.
- Undo / Redo buttons call the existing store `undo()` / `redo()` (shortcuts stay).
- Save state: `저장 안 됨 · 내 컴퓨터` after a change, `저장됨 · 내 컴퓨터` after saving.
- 저장 (also Ctrl+S) saves under the current file name, asking for one first when the work is untitled; 다른 이름으로 저장 always asks. Names are typed in place in the file pill, never in a `prompt()`.
- 작업 공간 바꾸기 asks for confirmation only when there are unsaved changes.
- 2D/3D switch replaces the old `3D 보기` header button.

## 9. Data model changes

- `selected_fixture_ids` is no longer used (keep reading old files; ignore the field).
- `SetPiece` gains `kind?: 'set' | 'wall' | 'deck' | 'apple'` (default `'set'`) — informational only.
- Fixture `label` becomes user-editable.
- Probe gets no new fields (costume colour already exists).
- UI-only state (active tool, open panels, drawer open, last ellipsoidal lens) is **not** saved to files and not put in undo history.

## 10. Where current features go

| Current location | Feature | New home |
|---|---|---|
| Landing | venue choice, load | unchanged; also ☰ menu |
| Header | 불러오기 / 저장 | ☰ menu + file pill |
| Header | 폭, 깊이, 배우 높이, 기본 Z | 공연장 정보 |
| Header | + / − / 초기화 zoom | wheel + status-bar zoom |
| Header | 3D 보기 | 2D/3D switch |
| Left | 씬 list | scene drawer |
| Left | 배경 이미지 | 레이어 |
| Left | 세트 panel | tools (create) + 객체 전체 목록 + 선택한 객체 속성 |
| Left | 전체 보기 옵션 (2D toggles, reference layers) | 빛 범위 표시 (toggles) + 레이어 (reference layers) |
| Right | 조명 기구 list + add controls | tools (add) + 객체 전체 목록 |
| Right | 위치 / 채널·타입·광학 / 젤 / 디머 / 셔터 / 그림자 | split: 선택한 객체 속성 (이름, 채널, 위치, 조준점) and 조명 설정 (the five) |
| Right | 밝기 Probe | actor selection in 선택한 객체 속성 + canvas lux label; lamp choice → 공연장 정보 |
| Right | 채널 사용 현황 | 채널 검사 |
| 3D overlay | 극장 구조 / 캣워크 / 객석 / 작업등 | 3D 극장 구조 (tray, 3D only) |
| Shortcuts only | undo / redo | file-pill buttons too |

## 11. Out of scope for this redesign

Login, sharing, cloud save, tape measure tool, tool search. Keep the `로그인` / `공유` buttons as disabled placeholders.

## 12. Visual tokens (from the mockup)

Chrome uses the mockup's tokens: light `--page #dfe3e8`, `--surface #fff`, `--surface-2 #f3f5f8`, `--line #d3d9e0`, `--ink #1d2733`, `--ink-2 #5b6878`, `--ink-3 #8a96a4`, `--accent #1f6fd1`, `--accent-soft #e3eefc`; dark variants as in the mockup. Font: IBM Plex Sans KR (UI), IBM Plex Mono (numbers where useful). Floating elements: white, 1px line border, 8px radius, soft two-layer shadow. Set handles: corners white fill + accent stroke; rotation handle `#f5c400` with a thin accent stick.
The 2D plan's own drawing colours may stay as they are until the final polish phase.
