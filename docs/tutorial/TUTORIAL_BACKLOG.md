# Features added after the tutorial, and what the tutorial should pick up

The 8-lesson tutorial (`src/tutorial/lessons.ts`, spec in `TUTORIAL_SPEC.md`) was finished at main `b18ca1e` (2026-10-21). This file lists every user-visible feature added after that, where it lives, and what the tutorial needs because of it. Keep it up to date when a feature lands; tick items off when the tutorial covers them.

Status legend: **main** = merged and deployed · **branch** = built, not merged yet.

## 1. Features added since the tutorial

| # | Feature | Where in the UI | Status | Details |
|---|---|---|---|---|
| F1 | **두레문예관** venue (second school theatre): 16.4 × 23.1 m hall, 1.1 m balcony on three sides at 2.7 m with metal railing, 7.2 m lighting grid (no catwalk), 10-row seating, projection windows, vector floor plan | Home → 새 작업 → 두레문예관 | main `605d41b` | `docs/venues/DURE_MODEL.md` |
| F2 | 3D toggle renamed **캣워크·조명 그리드** (shows the catwalk in 인문소극장, the 7.2 m grid plane in 두레문예관) | 3D → 3D 극장 구조 | main | same |
| F3 | **레이어** panel lists the current venue's plan layers (was hard-wired to 인문소극장's two checkboxes) | 레이어 | main | same |
| F4 | New works put the first actor and the first light's aim in the middle of the acting area (in front of the seating), not in the seats | new work | main | same |
| F5 | **Per-scene hiding of sets and actors**: the eye button in 객체 전체 목록 and the `이 씬에서 · 보이기` checkbox in 선택한 객체 속성 hide a set / actor in the current scene only. Hidden items also stop blocking light and drop out of the face-brightness numbers and 3D shadows | 객체 전체 목록, 선택한 객체 속성 | branch `feature/scene-import` (`971378e`) | `docs/scenes/SCENE_IMPORT.md` |
| F6 | **씬 가져오기 (이어 붙이기)**: append scenes of another work (local JSON or one of my online works). Same venue only; pick scenes with thumbnails; preview of sets/actors brought along, channel clashes and file size; one undo step | ☰ → 씬 가져오기 (이어 붙이기) | branch `feature/scene-import` | same |
| F7 | **Share links** (read-only): owner turns on a link in the 공유 dialog; anyone with the link can open the work without signing in, try things, and keep a copy, but never change the original | top-right 공유 button, Home card ⋯ → 공유… | branch `feature/share` (`83e2bea`, `f8cc7ce`), built by the cloud session | `docs/cloud/CLOUD_SPEC.md` §10 |
| F8 | Actor name and `얼굴 N lux` label is drawn **only for the selected actor** (was always on). Plan export still labels every actor | 2D plan | branch `feature/scene-import` | `render/canvas.ts` `drawCueToContext(…, labelAllActors)` |
| F9 | **PAR lamp is MFL only** (the theatre has no other PAR lamps). The lamp row in 조명 설정 is a fixed label; old files with VNSP/NSP/WFL are converted to MFL on load | 조명 설정 (PAR) | branch `feature/scene-import` | `ui/lightSettings.ts`, `state/store.ts` |

Behaviour changes that make existing tutorial text slightly off:
- The actor's eye button used to hide an actor in **all** scenes; now it is per scene (F5). Old files are converted on load.
- 3D panel label `캣워크` → `캣워크·조명 그리드` (F2).
- The actor label is no longer always visible (F8). Lessons 1–3 were updated with F8: lesson 1 says the label appears when you click the actor; lesson 2's `배우 얼굴 밝기 읽기` is now an action step (click the actor, then read the label; `manual`), and the next step re-selects the light before opening 조명 설정; lesson 3 says the face lux shows when you click the actor.

## 2. Tutorial changes to make

### Corrections to existing lessons
- [ ] **Lesson 7 (view3d)**, step `3D 극장 구조`: the text lists "캣워크"; the checkbox is now `캣워크·조명 그리드`. Mention that 두레문예관 has a lighting grid instead of a catwalk.
- [ ] **Lesson 2 (first-light)**, step `배우 앞쪽에 조명을 다세요`: "조명은 누른 곳에서 가장 가까운 파이프에 달립니다" is true for 인문소극장 only (두레문예관 has no known pipe positions, lights stay where you click). Fine while the practice work is 인문소극장; reword if lessons ever run in another venue.
- [x] F8 text changes in lessons 1–3 (done with F8; still covered by the full re-run below).
- [ ] Re-check every lesson after F5/F6/F7 merge: run all eight lessons once with real input (same procedure as T4) since the object list rows now have an extra eye button on sets.

### New steps in existing lessons
- [ ] **Lesson 5 (sets)**: after the shadow step, add "이 씬에서 숨기기": hide the wall with its eye button in 객체 전체 목록, see the light reach the actor again (face lux goes up), show it again. Teaches that sets are shared by all scenes but can be hidden per scene. (F5)
- [ ] **Lesson 6 (scenes)**: after comparing the two scenes, hide the wall in `2장 밤` only and switch back to Scene 1 to see it is still there. Natural place to say "set changes between scenes". (F5)
- [ ] **Lesson 8 (save)**: add explanation-only steps for
  - ☰ → **씬 가져오기 (이어 붙이기)**: joining two people's works into one show file, same venue only, imported items are hidden in the other scenes, channel clashes are reported (F6);
  - **공유** button: read-only link, viewers cannot change the original (F7, after it is merged).

### Possible new lesson
- [ ] **9강 · 다른 공연장과 작업 합치기** (optional, short): open 두레문예관 (F1) to show the balcony and grid in 3D, then demonstrate 씬 가져오기 with a prepared second practice work. Needs a built-in sample file for the import step, because the tutorial cannot ask the user to pick a file. Decide with the user whether this is worth a lesson or stays as lesson 8 explanations.

## 3. Notes for whoever edits the tutorial
- Lessons run in a practice work (`setupPractice` in `lessons.ts`, 인문소극장). Anything that depends on the venue should either stay in 인문소극장 or create its own practice work.
- Steps that only explain (no action) need `manual: true` so they do not advance before the user reads them (user decision, T1 review).
- Targets in dialogs (`.imp-dialog`, share dialog) are inside `<dialog>` elements in the top layer; the spotlight (`.tut-spot`) is not. Highlighting inside a modal dialog will need the bubble to be placed above the dialog or the step to point at the menu item instead.
- Verification procedure and the hidden-pane gotcha (rAF and CSS transitions freeze) are in `TUTORIAL_PHASES.md` T4.
