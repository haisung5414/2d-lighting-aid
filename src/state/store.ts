// src/state/store.ts

import type { AppState, Cue, Fixture, ReferenceLayer } from '../types';
import { generateThumbnail } from '../render/canvas';
import { HUMANITIES_VENUE, VENUES, type VenueKey, type VenuePreset } from '../config/venues';

const mapReferenceLayers = (venue: VenuePreset): ReferenceLayer[] => (
  venue.referenceLayers.map(layer => ({
    id: layer.id,
    label: layer.label,
    image: layer.image,
    blend_mode: layer.blendMode,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    opacity: layer.opacity,
    is_visible: layer.defaultVisible
  }))
);

/** 3D 사람 모형의 기본 의상 색: 젤 색이 잘 보이는 중간 회색 */
export const DEFAULT_COSTUME_COLOR = '#8f8f8f';

const createInitialState = (venue: VenuePreset): AppState => {
  const fixtureX = venue.stage.width / 2;

  return {
    stage_config: {
      venue_key: venue.key,
      width: venue.stage.width,
      depth: venue.stage.depth,
      actor_height: venue.stage.actorHeight,
      default_z: venue.stage.defaultFixtureZ,
      reference_layers: mapReferenceLayers(venue)
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
            channel: 1,
            type: "ellipsoidal",
            lens_type: "36deg",
            position: { x: fixtureX, y: 1, z: venue.stage.defaultFixtureZ },
            target: { x: fixtureX, y: venue.stage.depth / 2 },
            shutter_active: false,
            is_visible: true,
            shutter_polygon: [
              { dx: -1.5, dy: -1.5 }, { dx: 1.5, dy: -1.5 },
              { dx: 1.5, dy: 1.5 }, { dx: -1.5, dy: 1.5 }
            ],
            edge_softness: 0
          }
        ]
      }
    ],
    active_cue_index: 0,
    selected_fixture_id: "fixture_1",
    selected_fixture_ids: ["fixture_1"],
    interaction: { dragMode: null, draggedIndex: -1 },
    probe: {
      x: fixtureX,
      y: venue.stage.depth / 2,
      is_visible: true
    }
  };
};

let state: AppState = createInitialState(HUMANITIES_VENUE);

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

const normalizeFixtureSelection = () => {
  const cue = state.cues[state.active_cue_index];
  const validIds = new Set(cue?.fixtures.map(f => f.id) ?? []);

  state.stage_config.reference_layers?.forEach(layer => {
    if (layer.image.startsWith('/venues/')) {
      layer.image = `${import.meta.env.BASE_URL}${layer.image.replace(/^\/+/, '')}`;
    }
  });

  if (!state.probe) {
    state.probe = {
      x: state.stage_config.width / 2,
      y: state.stage_config.depth / 2,
      is_visible: true
    };
  }

  state.cues.forEach(item => {
    item.fixtures.forEach((fixture: any) => {
      if (!fixture.type) fixture.type = 'ellipsoidal';
      if (fixture.type === 'ellipsoidal' && !fixture.lens_type) fixture.lens_type = '36deg';
      if (fixture.type === 'zoom') {
        if (!fixture.zoom_range) fixture.zoom_range = 'narrow';
        if (!Number.isFinite(fixture.zoom_angle)) fixture.zoom_angle = fixture.zoom_range === 'medium' ? 35 : 26;
        const zoomRange = fixture.zoom_range === 'medium'
          ? { min: 25, max: 50 }
          : { min: 15, max: 30 };
        fixture.zoom_angle = Math.min(zoomRange.max, Math.max(zoomRange.min, fixture.zoom_angle));
      }
      if (fixture.type === 'fresnel') {
        if (!fixture.focus) fixture.focus = 'medium';
        if (!Number.isFinite(fixture.focus_level)) fixture.focus_level = 0.5;
        fixture.shutter_active = false;
      }
      if (fixture.type === 'par') {
        if (!fixture.lamp_type) fixture.lamp_type = 'MFL';
        if (!Number.isFinite(fixture.rotation_angle)) fixture.rotation_angle = 0;
        fixture.shutter_active = false;
      }
      if ((fixture.type === 'ellipsoidal' || fixture.type === 'zoom') && !fixture.shutter_polygon) {
        fixture.shutter_polygon = [
          { dx: -1.5, dy: -1.5 }, { dx: 1.5, dy: -1.5 },
          { dx: 1.5, dy: 1.5 }, { dx: -1.5, dy: 1.5 }
        ];
      }
      fixture.edge_softness = 0;
    });
  });

  if (!Array.isArray(state.selected_fixture_ids)) {
    state.selected_fixture_ids = state.selected_fixture_id ? [state.selected_fixture_id] : [];
  }

  state.selected_fixture_ids = state.selected_fixture_ids.filter(id => validIds.has(id));

  if (state.selected_fixture_id && !validIds.has(state.selected_fixture_id)) {
    state.selected_fixture_id = state.selected_fixture_ids[0] ?? cue?.fixtures[0]?.id ?? null;
  }

  if (state.selected_fixture_id && !state.selected_fixture_ids.includes(state.selected_fixture_id)) {
    state.selected_fixture_ids.push(state.selected_fixture_id);
  }
};

export const setState = (updater: (draft: AppState) => void) => {
  updater(state);
  normalizeFixtureSelection();

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

const resetHistory = () => {
  past = [];
  future = [];
};

const showEditorScreen = () => {
  const landingScreen = document.getElementById('landing-screen');
  const editorScreen = document.getElementById('editor-screen');

  if (landingScreen) landingScreen.style.display = 'none';
  if (editorScreen) editorScreen.style.display = 'flex';
};

const syncVenueFormControls = () => {
  const inputMap: Record<string, number> = {
    'stage-w': state.stage_config.width,
    'stage-d': state.stage_config.depth,
    'actor-h': state.stage_config.actor_height,
    'default-z': state.stage_config.default_z
  };

  Object.entries(inputMap).forEach(([id, value]) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = value.toString();
  });

  document.querySelectorAll<HTMLInputElement>('input[id^="tg-ref-"]').forEach(el => {
    el.checked = false;
  });

  state.stage_config.reference_layers.forEach(layer => {
    const el = document.getElementById(`tg-ref-${layer.id}`) as HTMLInputElement | null;
    if (el) el.checked = layer.is_visible;
  });
};

export const initVenue = (venueKey: VenueKey) => {
  const venue = VENUES[venueKey];
  if (!venue) return;

  state = createInitialState(venue);
  resetHistory();
  commitHistory();
  syncVenueFormControls();
  showEditorScreen();
  notify();
};
