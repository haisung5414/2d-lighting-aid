// src/state/store.ts

import type { AppState, Cue, Fixture, ReferenceLayer } from '../types';
import { generateThumbnail } from '../render/canvas';
import { setHiddenIn } from './sceneVisibility';
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
/** 얼굴(밝기를 재는 지점)은 정수리보다 이만큼 아래에 있다 (m) */
export const ACTOR_FACE_OFFSET = 0.12;
/** 새 사람 모형의 기본 키 (m) */
export const DEFAULT_ACTOR_HEIGHT = 1.75;
export const actorFaceHeight = (actor: { height: number }) => Math.max(0.1, actor.height - ACTOR_FACE_OFFSET);

const newActorId = () => `actor_${Math.random().toString(36).substring(2, 11)}`;

/** 새 사람 모형. 이름은 배우1, 배우2 …에서 비어 있는 다음 번호 */
export const createActor = (x: number, y: number, existing: { label: string }[]) => {
  let n = 1;
  const names = new Set(existing.map(a => a.label));
  while (names.has(`배우${n}`)) n++;
  return { id: newActorId(), label: `배우${n}`, x, y, height: DEFAULT_ACTOR_HEIGHT, is_visible: true, costume_color: DEFAULT_COSTUME_COLOR };
};

const createInitialState = (venue: VenuePreset): AppState => {
  const fixtureX = venue.stage.width / 2;
  // 객석이 있는 극장은 객석 앞 연기 공간의 가운데에, 없으면 무대 가운데에 사람 모형을 두고 조명을 겨눈다
  const actingY = venue.model3d?.seating ? venue.model3d.seating.y0 / 2 : venue.stage.depth / 2;

  return {
    stage_config: {
      venue_key: venue.key,
      width: venue.stage.width,
      depth: venue.stage.depth,
      actor_height: venue.stage.actorHeight,
      default_z: venue.stage.defaultFixtureZ,
      reference_layers: mapReferenceLayers(venue)
    },
    // 처음에는 바닥·얼굴 높이에 닿는 빛과 필드 각도선이 보인다. 빔 각도선은 "빛 범위 표시" 패널에서 켠다
    ui_toggles: { show_floor: true, show_face: true, show_beam: false, show_field: true, floor_style: 'gradient' },
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
            target: { x: fixtureX, y: actingY },
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
    selected_fixture_id: null, // 단일 선택: 처음에는 아무것도 고르지 않는다
    interaction: { dragMode: null, draggedIndex: -1 },
    selected_actor_id: null,
    actors: [createActor(fixtureX, actingY, [])]
  };
};

let state: AppState = createInitialState(HUMANITIES_VENUE);

// --- Undo / Redo System (History Stack) ---
const MAX_HISTORY = 30;
let past: AppState[] = [];
let future: AppState[] = [];

// 상태를 깊은 복사하는 유틸리티 함수
const cloneState = (s: AppState): AppState => JSON.parse(JSON.stringify(s));

/** 작업 내용이 바뀐 순간 (실행 취소 기록이 생기거나 되돌릴 때). 위쪽 바의 "저장 안 됨" 표시용 */
const editListeners = new Set<() => void>();
export const onEdit = (listener: () => void) => { editListeners.add(listener); };
const emitEdit = () => editListeners.forEach(listener => listener());

export const commitHistory = () => {
  emitEdit();
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
    emitEdit();
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
    emitEdit();
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

  // 공연장 도면이 바뀐 경우(예: 두레문예관 사진 → 다시 그린 도면) 저장 파일의 레이어도 지금 도면과 위치를 쓴다.
  // 보기 여부와 투명도는 사용자가 정한 값을 둔다
  const venueLayers = VENUES[state.stage_config.venue_key as VenueKey]?.referenceLayers ?? [];
  state.stage_config.reference_layers?.forEach(layer => {
    const current = venueLayers.find(item => item.id === layer.id);
    if (!current) return;
    Object.assign(layer, { image: current.image, x: current.x, y: current.y, width: current.width, height: current.height });
  });

  // 예전 파일: 사람 모형 하나(probe)를 actors로 옮긴다. 얼굴 높이가 그대로 되도록 키를 정한다
  if (!Array.isArray(state.actors)) {
    const old = state.probe;
    state.actors = old ? [{
      id: newActorId(),
      label: '배우1',
      x: old.x,
      y: old.y,
      height: Number(((state.stage_config.actor_height ?? DEFAULT_ACTOR_HEIGHT - ACTOR_FACE_OFFSET) + ACTOR_FACE_OFFSET).toFixed(2)),
      is_visible: old.is_visible !== false,
      costume_color: old.costume_color ?? DEFAULT_COSTUME_COLOR
    }] : [];
  }
  delete state.probe;
  if (state.selected_actor_id && !state.actors.some(a => a.id === state.selected_actor_id)) state.selected_actor_id = null;

  // 예전 파일: 사람 모형의 "숨김"은 모든 씬에 함께 적용됐다. 지금은 씬마다 숨기므로 모든 씬의 숨김 목록으로 옮긴다
  state.actors.forEach(actor => {
    if (actor.is_visible !== false) return;
    state.cues.forEach(cue => setHiddenIn(cue, 'hidden_actor_ids', actor.id, true));
    actor.is_visible = true;
  });
  // 지워진 세트·사람 모형은 씬의 숨김 목록에서도 뺀다
  const setIds = new Set((state.stage_config.set_pieces ?? []).map(piece => piece.id));
  const actorIds = new Set(state.actors.map(actor => actor.id));
  state.cues.forEach(cue => {
    if (cue.hidden_set_ids?.some(id => !setIds.has(id))) {
      cue.hidden_set_ids = cue.hidden_set_ids.filter(id => setIds.has(id));
      if (!cue.hidden_set_ids.length) delete cue.hidden_set_ids;
    }
    if (cue.hidden_actor_ids?.some(id => !actorIds.has(id))) {
      cue.hidden_actor_ids = cue.hidden_actor_ids.filter(id => actorIds.has(id));
      if (!cue.hidden_actor_ids.length) delete cue.hidden_actor_ids;
    }
  });

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
        // 극장에 있는 PAR 램프는 MFL뿐이다. 예전 파일의 VNSP·NSP·WFL도 MFL로 바꾼다
        fixture.lamp_type = 'MFL';
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

  // 예전 파일의 여러 개 선택 목록은 쓰지 않는다
  delete (state as { selected_fixture_ids?: string[] }).selected_fixture_ids;
  if (state.selected_fixture_id && !validIds.has(state.selected_fixture_id)) {
    state.selected_fixture_id = null; // 단일 선택: 지워진 조명을 골라 둔 상태면 선택을 비운다
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
  // 새 작업: 파일 이름과 저장 상태를 처음으로 (ui/shell.ts)
  window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name: null } }));
};
