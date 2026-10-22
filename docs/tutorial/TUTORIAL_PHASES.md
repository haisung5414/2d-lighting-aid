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

## T2 — Lessons 3–5 `[x]`
- 조명 다듬기, 배우 얼굴 밝기 읽기, 세트와 그림자.

Done notes:
- Lesson 3 (shape): selects L1 and forces 조명 설정 open (`selectFixture` + `openSelected`, so the auto-open opt-out does not hide it); steps for lens, gel, dimmer (explains the square law), shutter on, drag a red corner. All "look at the result" steps are `manual`.
- Lesson 4 (actors): place a second actor at a marked spot, 선택한 객체 속성, change 키 (explains face = 키 − 120 mm and that 빛 범위 표시 uses its own height), drag the actor into the light (done when its face lux > 50 and ≥ half of actor 1), contribution table.
- Lesson 5 (sets): wall placed 0.8 m in front of the actor — the front light's ray to the face crosses that line at ≈ 2.2 m, so the 2.44 m wall blocks it (face 0 lux) and typing `1200mm` in the VCB brings it back (979 lux in the test); corner handle, rotation handle (spotlight computed like `canvas.ts`: top-edge midpoint + 26 px), 3D, 3D shadow on.
- Practice work is remembered (`practiceOpen`, cleared by any `lighting:file` event), so chaining lessons or restarting one never asks to save the practice work.
- Verified in the browser with the real inputs (select change, gel click, slider change, shutter corner drag, actor tool + click, height input, actor drag, wall tool + click, VCB typing, corner drag, rotate handle drag, 3D, shadow checkbox).

Review fixes (user, after T2):
- Auto-start now continues with the next unfinished lesson on every signed-in visit, progress per account, with an opt-out checkbox in the 도우미 panel. The earlier version only started lesson 1 once per account, and the user could not have seen it anyway: the tutorial was not deployed and the 5174 dev server had no `.env.local` (5174 is also not an allowed Supabase redirect URL). For local sign-in tests this worktree now has `.env.local` (git-ignored, copied from the cloud worktree) and runs on port 5173.
- Checked with a fake member through `maybeAutoStart`: first visit starts lesson 1; after lesson 1 is recorded, the next page load starts lesson 2; a second call in the same visit does nothing.
- Lesson 5 no longer talks about the wall blocking light (not an intended teaching point); the wall goes behind the actor.
- VCB is millimetres only (user decision): plain numbers are mm, an optional `mm` suffix is accepted, m and cm are rejected; the move distance is shown in mm. Lesson 5 asks for `1200`.

- Signed-out visitors too (user request): `home.ts` now exposes `onHomeShown` / `isHomeShown`, and auto-start runs whenever Home (not the login screen) is shown, once per page load. Checked on 5173 with the real login screen: no tutorial on the login screen; `로그인 없이 시작하기` → lesson 1 at once; after lesson 1 is recorded, the next page load starts lesson 2. Merged main (47e4c79) into this branch first because `home.ts` changed there.

## T3 — Lessons 6–8 `[x]`
- 씬 만들기, 3D로 확인하기, 저장과 채널 검사.
- (The first-visit entry point became auto-start / auto-continue, see the T1 and T2 review fixes.)

Done notes:
- Lesson 6 (scenes): open the drawer, copy, rename in place (`2장 밤`), give the copy a gel (stored per scene), switch back to Scene 1 to compare, drag a card to reorder.
- Lesson 7 (view3d): enter 3D, 3D 극장 구조 panel, turn the work light on, toggle seating, orbit / zoom / pan (explanation only), drag the actor in 3D (done when the actor moves), back to 2D. Clicking a fixture in 3D is only mentioned: the practice front light hangs over the audience and may be outside the default 3D view.
- Lesson 8 (save): set channel 4 in 선택한 객체 속성, open 채널 검사 (legend explained), click cell 4 for the detail, then explanation-only steps for ☰ 저장 (online when signed in, a JSON download otherwise; Ctrl+S; the practice work need not be saved) and the home button.
- Lesson 5's last step now points to lesson 6.
- Verified in the browser on 5173: with lessons 1–5 recorded and `로그인 없이 시작` set, opening the app auto-started lesson 6; lessons 6 → 7 → 8 ran to the end via 다음 강의 (the 3D actor drag was simulated with a state change; everything else used the real controls); all eight lessons recorded; on the next load nothing auto-starts.

## T4 — Polish `[x]`
- Copy review, dark mode, narrow screens, full run-through of every lesson.

Done notes:
- Copy: lesson 4's closing line no longer promises "sets blocking light"; the help-panel checkbox reads `들어올 때 남은 강의 이어서 하기` (it covers signed-out visitors too); lesson 1 mentions Enter.
- Keys: Esc no longer quits (it already cancels placing tools and renames, so it was quitting the tutorial by accident); Enter presses the bubble's primary button (다음 / 끝내기 / 다음 강의) unless focus is in a text field or an IME composition is active.
- 그만하기 shows a 4-second note above the status bar pointing to the ? (도우미) button.
- Layout check at 900 × 640 (dark mode) for every step of all eight lessons with CSS transitions disabled during measurement: every bubble is fully on screen; the only bubble/spotlight overlap is lesson 1 step 3, whose target is the whole plan.
- Measurement gotcha: in a hidden preview pane CSS transitions and requestAnimationFrame freeze, so positions read mid-animation; the tutorial's 120 ms interval keeps step checks working, but layout tests must disable transitions.
- Regression: lessons 1–2 again with real input and Enter; Esc keeps the lesson; quitting shows the note.

## T5 — Catch up with features added after the tutorial `[ ]`
- Features added since T4 (두레문예관, per-scene hiding, 씬 가져오기, share links) and the lesson changes they need are listed in `TUTORIAL_BACKLOG.md`. Start there.
