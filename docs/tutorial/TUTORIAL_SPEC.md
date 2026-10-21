# Tutorial — Spec

In-app guided tutorial for first-time users (student theatre club members who have never used lighting software). Written for Claude; UI copy is Korean.

## 0. Decisions (user, 2026-10-21)

- Format: **interactive, inside the app** — a spotlight on the relevant control plus a speech bubble. Steps that ask for an action advance on their own when the action happens.
- A **skip** button is always available (skip this step) as well as a way to quit.
- Written docs / videos: not now; later if needed, built from the same lesson outline.
- Start only after the login / online-save work is in main (done: 8d5637b).

## 1. Principles

- The tutorial runs on a **practice work** (인문소극장, one actor, no fixtures), so the user's own work is never touched. If the open work has unsaved changes, ask first (`confirm`).
- The tutorial never blocks the app: the dimmed area is visual only (`pointer-events: none`), so a user who wanders off can keep working; the bubble stays and the step still completes when its condition becomes true.
- Code lives in `src/tutorial/`. Existing UI gets only stable hooks (ids / data attributes it already has) and the entry point in the 도우미 panel. No tutorial logic inside existing modules.
- Progress (finished lesson ids) is kept in `localStorage` key `lightingAid.tutorial.done` (try/catch; works without it).

## 2. Engine

### 2.1 Lesson and step
```ts
interface TutorialLesson { id: string; title: string; minutes: number; summary: string; steps: TutorialStep[] }
interface TutorialStep {
  title: string;
  body: string;                 // fixed HTML written by us (never user input)
  target?: () => DOMRect | null; // what to spotlight; none = centred bubble
  done?: () => boolean;         // action step: advances automatically once true
  onEnter?: () => void;         // e.g. close panels, select something
}
```
- A step **without** `done` shows a `다음` button. A step **with** `done` shows `건너뛰기` instead (and `다음` appears once done, for the short moment before auto-advance).
- `done()` is evaluated every animation frame while the step is active (predicates are cheap reads of the store / DOM). When it turns true the step shows a check and advances after ~600 ms.
- Targets are re-measured every frame, so the spotlight follows panels that open, scrolling, zoom and resizing. A target that is missing (e.g. a closed panel) falls back to a centred bubble.
- Canvas targets use `worldToScreen` (`render/canvas.ts`) to spotlight a stage point (aim point, actor, a fixture).

### 2.2 Overlay
- Spotlight: a fixed, rounded box at the target rect (+6 px padding) with `box-shadow: 0 0 0 200vmax rgba(10,14,20,.55)`; a soft pulse ring on action steps. `pointer-events: none`.
- Bubble: fixed card beside the target (right, left, below or above — whichever fits, else centred), max width 320 px; shows lesson title, step `n / N`, step title, body, and buttons: `그만하기` (left), `건너뛰기` or `이전`/`다음` (right). Esc = 그만하기.
- Theme tokens from `ui/shell.css`, so dark mode works. z-index above every floating element (60).

### 2.3 Finishing
- The last step of a lesson ends with `끝내기` and, when a next lesson exists, `다음 강의`. Finishing records the lesson in `localStorage`.
- 그만하기 removes the overlay; the practice work stays open (the user may keep playing).

## 3. Entry points

- **도우미 panel** (T1): a `튜토리얼` section listing lessons — title, minutes, a ✓ when finished, and a `시작` button (or `다시 하기`).
- **First visit** (T3): on Home, a card `처음이라면 튜토리얼부터` with `시작`; dismissible, remembered in `localStorage`.

## 4. Lessons

| # | Title | The user does |
|---|---|---|
| 1 | 화면 둘러보기 | tool rail, right tray (open 빛 범위 표시), scene drawer, 2D ↔ 3D, the ? help button |
| 2 | 첫 조명 달기 | E (ellipsoidal) + lens, click the stage, drag the aim point to the actor, read `얼굴 N lux`, close and reopen 조명 설정 by double-click |
| 3 | 조명 다듬기 | lens, gel, dimmer, shutter corners |
| 4 | 배우 얼굴 밝기 읽기 | place a second actor, set 키, read contributions in 선택한 객체 속성 |
| 5 | 세트와 그림자 | place a wall / deck, resize with handles, type a height in 수치 |
| 6 | 씬 만들기 | copy a scene, rename, reorder |
| 7 | 3D로 확인하기 | 3D view, 3D 극장 구조 toggles, 3D shadow |
| 8 | 저장과 채널 검사 | save (local / online), channel check panel |

## 5. Out of scope

Videos, printed manuals, per-step analytics, tutorial-specific undo.
