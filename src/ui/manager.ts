// src/ui/manager.ts
import { getState, initVenue, setState, subscribe, commitHistory } from '../state/store';
import { DEFAULT_LAMP } from '../engine/photometrics';
import type { AppState } from '../types';
import type { VenueKey } from '../config/venues';

export const initManagerUI = () => {
  initLandingUI();
  syncStageInputs();

  // 전역 토글 이벤트 바인딩
  const toggleMap: Record<string, keyof AppState['ui_toggles']> = {
    'tg-floor': 'show_floor',
    'tg-face': 'show_face',
    'tg-beam': 'show_beam',
    'tg-field': 'show_field'
  };

  Object.entries(toggleMap).forEach(([id, key]) => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) {
      // 초기 상태 반영
      el.checked = getState().ui_toggles[key];
      // 변경 이벤트 리스너
      el.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        setState(state => {
          state.ui_toggles[key] = target.checked;
        });
      });
    }
  });

  getState().stage_config.reference_layers.forEach(layer => {
    const el = document.getElementById(`tg-ref-${layer.id}`) as HTMLInputElement;
    if (!el) return;

    el.checked = layer.is_visible;
    el.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      setState(state => {
        const targetLayer = state.stage_config.reference_layers.find(item => item.id === layer.id);
        if (targetLayer) {
          targetLayer.is_visible = target.checked;
        }
      });
    });
  });

  // 램프 규격 (공연장 정보 패널)
  const lampSelect = document.getElementById('venue-lamp') as HTMLSelectElement | null;
  if (lampSelect) {
    lampSelect.addEventListener('change', () => {
      commitHistory();
      setState(state => { state.stage_config.lamp = lampSelect.value as typeof state.stage_config.lamp; });
    });
    const syncLamp = () => { lampSelect.value = getState().stage_config.lamp ?? DEFAULT_LAMP; };
    subscribe(syncLamp);
    syncLamp();
  }

  // 무대 크기 입력 이벤트 바인딩
  ['stage-w', 'stage-d', 'actor-h', 'default-z'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) {
      el.addEventListener('change', () => updateStageConfig());
    }
  });
};

const initLandingUI = () => {
  document.querySelectorAll<HTMLButtonElement>('[data-venue-key]').forEach(button => {
    button.addEventListener('click', () => {
      const venueKey = button.dataset.venueKey as VenueKey | undefined;
      if (venueKey) initVenue(venueKey);
    });
  });

  const landingLoadButton = document.getElementById('landing-load-file') as HTMLButtonElement | null;
  const fileUploadInput = document.getElementById('file-upload') as HTMLInputElement | null;
  landingLoadButton?.addEventListener('click', () => fileUploadInput?.click());
  fileUploadInput?.addEventListener('change', loadFile);
};

const showEditorScreen = () => {
  const landingScreen = document.getElementById('landing-screen');
  const editorScreen = document.getElementById('editor-screen');

  if (landingScreen) landingScreen.style.display = 'none';
  if (editorScreen) editorScreen.style.display = 'flex';
};

const syncStageInputs = () => {
  const { stage_config } = getState();
  const inputMap: Record<string, number> = {
    'stage-w': stage_config.width,
    'stage-d': stage_config.depth,
    'actor-h': stage_config.actor_height,
    'default-z': stage_config.default_z
  };

  Object.entries(inputMap).forEach(([id, value]) => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) {
      el.value = value.toString();
    }
  });
};

const updateStageConfig = () => {
  const w = parseFloat((document.getElementById('stage-w') as HTMLInputElement).value);
  const d = parseFloat((document.getElementById('stage-d') as HTMLInputElement).value);
  const h = parseFloat((document.getElementById('actor-h') as HTMLInputElement).value);
  const z = parseFloat((document.getElementById('default-z') as HTMLInputElement).value);

  commitHistory();
  setState(state => {
    state.stage_config.width = w;
    state.stage_config.depth = d;
    state.stage_config.actor_height = h;
    state.stage_config.default_z = z;
  });
};

/** 작업을 JSON 파일로 내려받는다. 이름은 위쪽 바의 파일 이름 (ui/shell.ts가 정한다) */
export const saveProject = (name: string) => {
  const base = name.trim().replace(/\.json$/i, '') || '이름 없는 작업';
  const fileName = `${base}.json`;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(getState(), null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', fileName);
  link.click();
  // 위쪽 바의 파일 이름과 "저장됨" 표시 (ui/shell.ts)
  window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name: fileName } }));
};

/** 파싱한 작업 JSON을 불러와 편집 화면을 연다. 로컬 파일과 온라인 작업(src/cloud)이 함께 쓴다.
 *  name은 위쪽 바에 보일 파일 이름 (.json은 떼고 보인다). 형식이 틀리면 예외를 던진다 */
export const loadProjectData = (parsed: any, name: string | null) => {
  // 드래그 상태 등 불필요한/오염된 상호작용 상태 초기화
  parsed.interaction = { dragMode: null, draggedIndex: -1 };
  // 예전 파일(사람 모형 하나 = probe)은 actors가 없다. 지금 작업의 actors가 남지 않게 비워 두면 store가 probe를 옮긴다
  if (!Array.isArray(parsed.actors)) parsed.actors = undefined;
  parsed.selected_actor_id = null;

  setState(state => {
    const currentReferenceLayers = state.stage_config.reference_layers;
    Object.assign(state, parsed);
    if (!state.stage_config.reference_layers) {
      state.stage_config.reference_layers = currentReferenceLayers;
    }
  });

  // UI 입력창 동기화
  (document.getElementById('stage-w') as HTMLInputElement).value = parsed.stage_config.width.toString();
  (document.getElementById('stage-d') as HTMLInputElement).value = parsed.stage_config.depth.toString();
  (document.getElementById('actor-h') as HTMLInputElement).value = parsed.stage_config.actor_height.toString();
  (document.getElementById('default-z') as HTMLInputElement).value = parsed.stage_config.default_z.toString();
  showEditorScreen();
  window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name } }));
};

const loadFile = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      loadProjectData(JSON.parse(e.target?.result as string), file.name);
    } catch (err) {
      alert("파일 파싱 오류. 올바른 JSON 파일인지 확인해주세요.");
    }
  };
  reader.readAsText(file);
  target.value = ""; // 동일 파일 연속 업로드 허용
};
