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

Review fixes (user, after T1):
- Auto-start lesson 1 on an account's first sign-in (no question).
- `manual` + `afterBody` on steps with something to read after the action: 1강 빛 범위 표시, 1강 3D로 보기, 2강 조명 설정 닫기.
- Lesson 1 practice work has one front light, so 빛 범위 표시 and 3D show something.
- 3D work light (작업등) is off by default.
- Scene drawer: right offset 330 px (was 520) with min-width 260 px; it collapsed to a sliver on an 800 px-wide window.

## T2 — Lessons 3–5 `[ ]`
- 조명 다듬기, 배우 얼굴 밝기 읽기, 세트와 그림자.

## T3 — Lessons 6–8 + first visit `[ ]`
- 씬 만들기, 3D로 확인하기, 저장과 채널 검사.
- (First-visit entry point moved to T1 review fixes: auto-start on first sign-in.)

## T4 — Polish `[ ]`
- Copy review, dark mode, narrow screens, full run-through of every lesson.
