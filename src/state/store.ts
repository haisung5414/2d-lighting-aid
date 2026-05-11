// src/state/store.ts

import type { AppState, Cue, Fixture } from '../types';
import { generateThumbnail } from '../render/canvas';
import { HUMANITIES_VENUE } from '../config/venues';

const humanitiesReferenceLayers = HUMANITIES_VENUE.referenceLayers.map(layer => ({
  id: layer.id,
  label: layer.label,
  image: layer.image,
  x: layer.x,
  y: layer.y,
  width: layer.width,
  height: layer.height,
  opacity: layer.opacity,
  is_visible: layer.defaultVisible
}));

let state: AppState = {
  stage_config: {
    width: HUMANITIES_VENUE.stage.width,
    depth: HUMANITIES_VENUE.stage.depth,
    actor_height: HUMANITIES_VENUE.stage.actorHeight,
    default_z: HUMANITIES_VENUE.stage.defaultFixtureZ,
    reference_layers: humanitiesReferenceLayers
  },
  ui_toggles: { show_floor: true, show_face: true, show_beam: true, show_field: true },
  cues: [
    {
      cue_id: "cue_1",
      label: "Scene 1",
      fixtures: [
        {
          id: "fixture_1",
          label: "L1 (Center)",
          lens_type: "36deg",
          position: { x: HUMANITIES_VENUE.stage.width / 2, y: 1, z: HUMANITIES_VENUE.stage.defaultFixtureZ },
          target: { x: HUMANITIES_VENUE.stage.width / 2, y: HUMANITIES_VENUE.stage.depth / 2 },
          shutter_active: false,
          is_visible: true,
          shutter_polygon: [
            { dx: -1.5, dy: -1.5 }, { dx: 1.5, dy: -1.5 },
            { dx: 1.5, dy: 1.5 }, { dx: -1.5, dy: 1.5 }
          ],
          edge_softness: 5
        }
      ]
    }
  ],
  active_cue_index: 0,
  selected_fixture_id: "fixture_1",
  interaction: { dragMode: null, draggedIndex: -1 }
};

// --- Undo / Redo System (History Stack) ---
const MAX_HISTORY = 30;
let past: AppState[] = [];
let future: AppState[] = [];

// 상태를 깊은 복사하는 유틸리티 함수
const cloneState = (s: AppState): AppState => JSON.parse(JSON.stringify(s));

export const commitHistory = () => {
  past.push(cloneState(state));
  if (past.length > MAX_HISTORY) {
    past.shift(); // 메모리 누수 방지 (최대 개수 초과 시 가장 오래된 기록 삭제)
  }
  future = []; // 새로운 액션이 발생하면 future를 비움
};

export const undo = () => {
  if (past.length === 0) return;
  const previous = past.pop();
  if (previous) {
    future.push(cloneState(state));
    state = previous;
    state.interaction.dragMode = null; // 안전을 위해 드래그 상태 초기화
    notify();
  }
};

export const redo = () => {
  if (future.length === 0) return;
  const next = future.pop();
  if (next) {
    past.push(cloneState(state));
    state = next;
    state.interaction.dragMode = null;
    notify();
  }
};
// ------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const notify = () => {
  listeners.forEach(listener => listener());
};

export const getState = (): AppState => state;

export const setState = (updater: (draft: AppState) => void) => {
  updater(state);

  // 상태 변경이 완료된 직후, 현재 활성화된 씬의 썸네일을 재생성하여 덮어씌움
  const currentCue = state.cues[state.active_cue_index];
  if (currentCue) {
    currentCue.thumbnail = generateThumbnail(currentCue, state.stage_config, state.ui_toggles);
  }

  notify();
};

export const getCurrentCue = (): Cue | undefined => {
  return state.cues[state.active_cue_index];
};

export const getSelectedFixture = (): Fixture | undefined => {
  const cue = getCurrentCue();
  if (!cue) return undefined;
  return cue.fixtures.find(f => f.id === state.selected_fixture_id);
};
