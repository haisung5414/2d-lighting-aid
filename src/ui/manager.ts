// src/ui/manager.ts
import { getState, initVenue, setState } from '../state/store';
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
  
  setState(state => {
    state.stage_config.width = w;
    state.stage_config.depth = d;
    state.stage_config.actor_height = h;
    state.stage_config.default_z = z;
  });
};

// 전역(window) 객체에 연결하여 HTML의 onclick 속성에서 호출 가능하게 함
// src/ui/manager.ts 내 saveFile 함수 수정

(window as any).saveFile = () => {
  const state = getState();
  
  // 1. 사용자에게 저장할 파일 이름을 입력받음
  let fileName = prompt("저장할 파일 이름을 입력하세요 (확장자 제외):", "lighting_sim_save");

  // 사용자가 취소를 눌렀을 경우 중단
  if (fileName === null) return;

  // 빈 칸일 경우 기본 이름 설정
  if (fileName.trim() === "") fileName = "lighting_sim_save";

  // 확장자가 .json으로 끝나지 않으면 자동으로 붙여줌
  if (!fileName.toLowerCase().endsWith(".json")) {
    fileName += ".json";
  }

  // 2. JSON 데이터 생성
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  
  // 3. 다운로드용 링크 생성 및 실행
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", fileName); // 👈 입력받은 파일 이름 적용
  dlAnchorElem.click();
  // 화면 왼쪽 위 파일 이름 표시 (ui/shell.ts)
  window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name: fileName } }));
};

(window as any).loadFile = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      // 드래그 상태 등 불필요한/오염된 상호작용 상태 초기화
      parsed.interaction = { dragMode: null, draggedIndex: -1 };
      
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
      window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name: file.name } }));
    } catch (err) {
      alert("파일 파싱 오류. 올바른 JSON 파일인지 확인해주세요.");
    }
  };
  reader.readAsText(file);
  target.value = ""; // 동일 파일 연속 업로드 허용
};
