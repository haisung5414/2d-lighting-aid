# Scene import (append) and per-scene visibility

Added 2026-10-22 on `feature/scene-import`.

## Per-scene visibility
- Sets and actors stay shared by all scenes (position, size, height). Each scene (`Cue`) can hide some of them: `hidden_set_ids`, `hidden_actor_ids` (`src/state/sceneVisibility.ts`). Missing or empty list = everything visible, so old files open unchanged.
- Hidden means gone for that scene everywhere: face/horizontal lux (sets no longer block light), 2D drawing and hit-testing, set handles, 3D meshes and shadow occluders. The cost of a scene therefore depends only on what it shows.
- Object list: the eye button on sets and actors hides in the current scene only (row shows "이 씬에서 숨김"). Properties panel: "이 씬에서 · 보이기" checkbox for sets and actors.
- New sets/actors and new scenes start visible everywhere. Copying a scene copies its hidden lists.
- Old files: an actor with `is_visible: false` (old "hidden in all scenes") is moved into every scene's `hidden_actor_ids` on load and set back to `true`. Ids of deleted sets/actors are pruned from the lists.

## Scene import (☰ → 씬 가져오기 (이어 붙이기))
UI `src/ui/importScenes.ts` (lazy-loaded), logic `src/state/mergeWork.ts`.

1. Source: a local `.json` work file, or (signed in) one of my online works. Reading an online work does not open it.
2. Check: same venue (`venue_key`; old humanities files are recognised by their layer ids). Sandbox / custom stages must also have the same width × depth. A different lamp spec is a warning only.
3. Pick scenes: thumbnails with checkboxes, all checked. The preview runs the merge on a copy and shows sets/actors brought along, channel clashes and the resulting file size against the 5 MB online limit.
4. Merge (one undo step):
   - All sets and actors of the source are added with new ids. A source set equal to an existing one (position, size, rotation, colour within 1 mm / 0.5°) is merged into it; same for actors (position, height within 1 cm). Merged ones are visible in both groups of scenes.
   - Existing scenes hide the newly added sets/actors; imported scenes hide the existing ones (plus whatever they hid in the source).
   - Cue, fixture, set and actor ids are regenerated. Scene, set and actor names that already exist get the source file name in front: `햄릿 · Scene 1`.
   - Channel numbers are kept; a channel already used by a fixture at a different spot (> 5 cm) is reported.
   - The first imported scene becomes active. Venue, stage size, lamp, layers and view toggles of the current work are kept.

## Tested (dev server, 2026-10-22)
- Real dialog with a file fed through the file input: preview text, import, summary, hidden lists per scene, merged deck, channel 12 clash, label prefix.
- Undo removes the whole import; redo brings it back. A 두레문예관 file into a 인문소극장 work is refused.
- A hidden set between a light and an actor does not block (891 lux) while the same set shown blocks it (0 lux).
- Old file with a hidden actor converts to per-scene hidden lists.
- Not tested: the online-work list (needs a signed-in account), screenshots of the 2D/3D result (the app window was minimised).
