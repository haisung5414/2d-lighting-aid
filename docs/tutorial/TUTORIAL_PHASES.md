# Tutorial — Phases

Spec: `TUTORIAL_SPEC.md`. One phase at a time; commit each; the user reviews after each phase. No push or main merge without the user's approval. Branch: `feature/tutorial`.

## T1 — Engine + lessons 1–2 `[x]`
- `src/tutorial/` engine: overlay (spotlight + bubble), step runner with `done()` polling, skip / 그만하기 / Esc, progress in `localStorage`.
- Practice work setup (인문소극장, one actor, no fixtures) with an unsaved-changes confirm.
- 도우미 panel: 튜토리얼 section with lesson list and start buttons.
- Lessons 1 (화면 둘러보기) and 2 (첫 조명 달기).

Done notes:
- Files: `src/tutorial/engine.ts` (overlay, runner, progress, target helpers `el` / `union` / `first` / `around`), `lessons.ts`, `index.ts`, `tutorial.css`; `initTutorial()` in `main.ts`; the lesson list sits at the top of the 도우미 panel (`#tutorial-list`).
- The runner uses requestAnimationFrame for smooth tracking **and** a 120 ms interval, because rAF stops while the page is hidden (step checks must still fire).
- Practice work: 인문소극장 via `initVenue` + `markNewWork`, all fixtures removed, the actor moved to the acting-area centre (x 6, y = seating.y0 / 2 = 5.6). Unsaved changes → `confirm` first (`getFileState().dirty`).
- Lesson 2 marks the front pipe (pipe nearest actor.y + default fixture height, y 11.4) so the first light is a front light; a back light gives 0 face lux, which the lesson now explains. Lens choice is mentioned but not required (the E key skips the flyout).
- Verified in the browser: both lessons run start to finish with the real actions (tool key, stage click, aim drag, close, double-click), 다음 강의 chains 1 → 2, progress stored as `["tour"]`.

## T2 — Lessons 3–5 `[ ]`
- 조명 다듬기, 배우 얼굴 밝기 읽기, 세트와 그림자.

## T3 — Lessons 6–8 + first visit `[ ]`
- 씬 만들기, 3D로 확인하기, 저장과 채널 검사.
- Home card `처음이라면 튜토리얼부터` (dismissible).

## T4 — Polish `[ ]`
- Copy review, dark mode, narrow screens, full run-through of every lesson.
