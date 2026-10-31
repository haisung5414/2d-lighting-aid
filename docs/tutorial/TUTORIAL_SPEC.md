# Tutorial — Spec

In-app guided tutorial for first-time users (student theatre club members who have never used lighting software). Written for Claude; UI copy is Korean.

## 0. Decisions (user, 2026-10-21)

- Format: **interactive, inside the app** — a spotlight on the relevant control plus a speech bubble. Steps that ask for an action advance on their own when the action happens.
- A **skip** button is always available (skip this step) as well as a way to quit.
- Written docs / videos: not now; later if needed, built from the same lesson outline.
- Start only after the login / online-save work is in main (done: 8d5637b).

## 1. Principles

- The tutorial runs on a **practice work** (인문소극장, one actor at the acting-area centre; lessons that are not about placing lights start with one front ellipsoidal already aimed at the actor), so the user's own work is never touched. If the editor has unsaved changes, ask first (`confirm`); starting from Home, or replacing a practice work that is still open, never asks.
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
- `manual: true` (user decision 2026-10-21): once done, the step does **not** auto-advance; it shows `afterBody` (if any) and waits for `다음`, so there is time to read and look at the result. Use it whenever there is something to read or see after the action.
- `done()` is evaluated every animation frame while the step is active (predicates are cheap reads of the store / DOM). When it turns true the step shows a check and advances after ~600 ms.
- Targets are re-measured every frame, so the spotlight follows panels that open, scrolling, zoom and resizing. A target that is missing (e.g. a closed panel) falls back to a centred bubble.
- Canvas targets use `worldToScreen` (`render/canvas.ts`) to spotlight a stage point (aim point, actor, a fixture).

### 2.2 Overlay
- Spotlight: a fixed, rounded box at the target rect (+6 px padding) with `box-shadow: 0 0 0 200vmax rgba(10,14,20,.55)`; a soft pulse ring on action steps. `pointer-events: none`.
- Bubble: fixed card beside the target (right, left, below or above — whichever fits, else centred), max width 320 px; shows lesson title, step `n / N`, step title, body, and buttons: `그만하기` (left), `건너뛰기` or `이전`/`다음` (right). Enter presses the primary button (다음 / 끝내기 / 다음 강의) when focus is not in a text field. Esc is **not** used (it already cancels placing tools and renames). 그만하기 shows a short note pointing to the ? (도우미) button.
- Theme tokens from `ui/shell.css`, so dark mode works. z-index above every floating element (60).

### 2.3 Finishing
- The last step of a lesson ends with `끝내기` and, when a next lesson exists, `다음 강의`. Finishing records the lesson in `localStorage`.
- 그만하기 removes the overlay; the practice work stays open (the user may keep playing).

## 3. Entry points

- **도우미 panel** (T1): a `튜토리얼` section listing lessons — title, minutes, a ✓ when finished, and a `시작` button (or `다시 하기`).
- **Starting a new work from Home** (user decision 2026-10-26, replaces the earlier "every visit to Home" auto-start, which threw new people straight into the editor before they saw the start screen or Home). The start screen, login and Home (my works) work as usual. When someone starts a new work from Home (a theatre card or 새로 만들기), the first lesson they have not finished starts at once, without asking — once per page load, not when opening an existing work. Progress per account (`lightingAid.tutorial.done:<user id>`; signed-out progress uses the plain key). Because lessons run in the practice work, 끝내기 or 그만하기 on an auto-started lesson re-opens a blank new work in the theatre they picked; 다음 강의 keeps going in the practice work, and nothing is restored if another work was opened meanwhile. The 도우미 panel has `새 작업을 시작할 때 남은 강의 이어서 하기` (on by default; off = `lightingAid.tutorial.autoContinueOff`). (`src/tutorial/autostart.ts`, `maybeAutoStart`; hook `onNewWorkStarted` in `src/cloud/home.ts`)

## 4. Lessons

Steps are in `src/tutorial/lessons.ts`; this table is the outline (updated after T5, 2026-10-31). (explain) = explanation-only step, no action.

| # | Title | Practice work | The user does |
|---|---|---|---|
| 1 | 화면 둘러보기 | actor + front light | tool rail, plan, right tray (open 빛 범위 표시), scene drawer, 3D and back to 2D, the ? help button |
| 2 | 첫 조명 달기 | actor only | E (ellipsoidal; lens choice explained, zoom greyed out in 인문소극장), click the front pipe, drag the aim point to the actor, click the actor to read `얼굴 N lux`, close 조명 설정 with ✕ and reopen it by double-clicking the light |
| 3 | 조명 다듬기 | actor + front light | change lens, add a gel, lower the dimmer (square law explained), turn the shutter on, drag a red shutter corner |
| 4 | 배우 얼굴 밝기 읽기 | actor + front light | A, place a second actor at a marked spot, change its 키 in 선택한 객체 속성, drag it into the light, read the per-light contribution table |
| 5 | 세트와 그림자 | actor + front light | W, place a wall behind the actor, type `1200` + Enter in 수치 (mm), drag a corner handle, rotate with the yellow handle, M (줄자) and measure wall → actor, 3D, turn on 3D shadow for the light; closing text mentions Delete / Ctrl+Z and 다중 선택 (V). No set-blocks-light explanation (user decision) |
| 6 | 씬 만들기 | actor + front light + wall | open the scene drawer, copy the scene, rename it `2장 밤`, add a gel in that scene, hide the wall in that scene with the eye button in 객체 전체 목록, go back to Scene 1 (gel gone, wall still there), drag a card to reorder |
| 7 | 3D로 확인하기 | actor + front light | 3D, 3D 극장 구조 panel (캣워크·조명 그리드 explained), turn on 작업등, toggle 객석, orbit / zoom / pan (explain), drag the actor in 3D, back to 2D |
| 8 | 저장과 채널 검사 | actor + front light | set channel 4 in 선택한 객체 속성, open 채널 검사, click cell 4 for the detail; then (explain) the 저장 button (online with 5-minute auto-save when signed in, JSON download otherwise), ☰ 씬 가져오기 (이어 붙이기), the 공유 button, the home button |

## 5. Out of scope

Videos, printed manuals, per-step analytics, tutorial-specific undo.
