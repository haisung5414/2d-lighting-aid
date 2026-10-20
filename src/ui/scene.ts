// src/ui/scene.ts
import { getState, setState, subscribe, commitHistory } from '../state/store';
import type { Cue } from '../types';

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).substring(2, 11)}`;

// 드래그 중인 씬의 인덱스를 추적하기 위한 전역 변수
let draggedIndex: number | null = null;

const renderBackgroundUI = () => {
  // DOM에 배경 패널 컨테이너가 없으면 동적으로 생성
  let bgContainer = document.getElementById('bg-settings-container');
  if (!bgContainer) {
    const cueListEl = document.getElementById('cue-list');
    bgContainer = document.createElement('div');
    bgContainer.id = 'bg-settings-container';
    cueListEl?.parentElement?.appendChild(bgContainer);
  }

  const state = getState();
  const cue = state.cues[state.active_cue_index];
  if (!cue) return;

  const bg = cue.background;
  let html = `<details class="collapsible-section"><summary class="panel-header collapsible-summary" style="font-size: 0.9em; padding: 10px 15px;">배경 이미지 크기 및 위치 조절</summary><div class="collapsible-body">`;

  if (bg) {
    // 배경이 존재할 때: 조절 UI 표시
    html += `
      <div class="control-row">
        <label style="width:25px; font-size:0.8em;">X(m)</label> <input type="number" step="0.1" value="${bg.x}" onchange="updateBgProp('x', this.value)">
        <label style="width:25px; font-size:0.8em;">Y(m)</label> <input type="number" step="0.1" value="${bg.y}" onchange="updateBgProp('y', this.value)">
      </div>
      <div class="control-row">
        <label style="width:25px; font-size:0.8em;">W(m)</label> <input type="number" step="0.1" value="${bg.width}" onchange="updateBgProp('width', this.value)">
        <label style="width:25px; font-size:0.8em;">H(m)</label> <input type="number" step="0.1" value="${bg.height}" onchange="updateBgProp('height', this.value)">
      </div>
      <div class="control-group" style="padding: 8px;">
        <label>Opacity: ${bg.opacity}</label>
        <input type="range" min="0" max="1" step="0.05" value="${bg.opacity}" oninput="updateBgProp('opacity', this.value)">
      </div>
      <button class="btn btn-danger full-width-action" onclick="deleteBackground()">이미지 삭제</button>
    `;
  } else {
    // 배경이 없을 때: 업로드 버튼 표시
    html += `
      <input type="file" id="bg-upload" accept="image/png, image/jpeg, image/webp" style="display:none" onchange="uploadBackground(event)">
      <button class="btn btn-secondary full-width-action" onclick="document.getElementById('bg-upload').click()">배경 이미지 업로드</button>
    `;
  }
  
  html += `</div></details>`;
  bgContainer.innerHTML = html;
};

export const renderSceneList = () => {
  const cueListEl = document.getElementById('cue-list');
  if (!cueListEl) return;

  const state = getState();
  let html = "";

  state.cues.forEach((cue, idx) => {
    const isActive = idx === state.active_cue_index ? 'active' : '';

    // 썸네일 이미지가 있으면 <img> 태그, 없으면 빈 박스 렌더링
    const thumbHtml = cue.thumbnail 
      ? `<img src="${cue.thumbnail}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #444;" />`
      : `<div style="width: 40px; height: 40px; border-radius: 4px; background: #444;"></div>`;

    // 썸네일 레이아웃과 Drag & Drop 속성을 하나의 div로 통합
    html += `<div class='list-item ${isActive}' 
                  draggable='true' 
                  data-index='${idx}'
                  onclick='selectCue(${idx})'
                  ondragstart='handleDragStart(event)'
                  ondragover='handleDragOver(event)'
                  ondragenter='handleDragEnter(event)'
                  ondragleave='handleDragLeave(event)'
                  ondrop='handleDrop(event)'
                  ondragend='handleDragEnd(event)'
                  style='cursor: grab; transition: all 0.2s; align-items: flex-start;'>
               
               <!-- 👇 이 div의 display 속성을 column으로 변경하여 수직 배치합니다 -->
               <div style='display:flex; flex-direction:column; align-items:center; gap: 5px; flex:1; min-width:0; pointer-events: none;'>
                 ${thumbHtml}
                 <span style='font-weight:bold; font-size:0.9em; text-align:center; width:100%; word-break:break-all;'>${cue.label}</span>
               </div>
               
               <!-- 👇 우측 버튼 그룹: 방향을 세로로 묶거나 필요에 따라 정렬 가능. 여기서는 이름 변경 버튼(✏️)을 추가했습니다. -->
               <div style='display:flex; flex-direction:column; gap:4px; flex-shrink: 0;'>
                 <button class='btn-icon' title='이름 변경' onclick='renameCue(${idx}, event)'>이름 변경</button>
                 <button class='btn-icon' title='씬 복사' onclick='copyCue(${idx}, event)'>씬 복사</button>`;
    
    if (state.cues.length > 1) {
      html += `<button class='btn-danger' title='Delete' onclick='deleteCue(${idx}, event)'>X</button>`;
    }
    //📄
    html += `</div></div>`;
  });

  cueListEl.innerHTML = html;

  renderBackgroundUI();
};

// ==========================================
// 기존 씬 관리 로직
// ==========================================

(window as any).selectCue = (idx: number) => {
  setState(state => {
    state.active_cue_index = idx;
    state.selected_fixture_id = null; // 씬을 바꾸면 선택을 비운다
    state.selected_fixture_ids = [];
  });
};

(window as any).addCue = () => {
  commitHistory();

  setState(state => {
    const newIdx = state.cues.length + 1;
    state.cues.push({
      cue_id: generateId('cue'),
      label: `Scene ${newIdx}`,
      fixtures: []
    });
    state.active_cue_index = state.cues.length - 1;
    state.selected_fixture_id = null;
    state.selected_fixture_ids = [];
  });
};

(window as any).copyCue = (idx: number, event: Event) => {
  event.stopPropagation();
  commitHistory();

  setState(state => {
    const cueToCopy = state.cues[idx];
    const newCue: Cue = JSON.parse(JSON.stringify(cueToCopy));
    newCue.cue_id = generateId('cue');
    newCue.label = `${cueToCopy.label} (Copy)`;
    newCue.fixtures.forEach(f => { f.id = generateId('fixture'); });
    
    state.cues.splice(idx + 1, 0, newCue);
    state.active_cue_index = idx + 1;
    state.selected_fixture_id = null;
    state.selected_fixture_ids = [];
  });
};

(window as any).deleteCue = (idx: number, event: Event) => {
  event.stopPropagation();
  commitHistory();

  setState(state => {
    state.cues.splice(idx, 1);
    if (state.active_cue_index >= state.cues.length) {
      state.active_cue_index = Math.max(0, state.cues.length - 1);
    }
  });
};

// ======================
// 신규 : 배경 업로드 처리
(window as any).uploadBackground = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target?.result as string;
    commitHistory(); // 👈 상태 변경 전 스냅샷 저장
    setState(state => {
      const activeCue = state.cues[state.active_cue_index];
      if (activeCue) {
        activeCue.background = {
          dataUrl,
          x: 0,
          y: 0,
          width: state.stage_config.width, // 기본값: 무대 꽉 차게
          height: state.stage_config.depth,
          opacity: 0.5                     // 기본값: 반투명
        };
      }
    });
  };
  reader.readAsDataURL(file); // Base64 인코딩
  target.value = ""; // 연속 업로드 허용
};

// 배경 속성 업데이트
(window as any).updateBgProp = (prop: keyof import('../types').BackgroundImage, value: string) => {
  commitHistory();
  setState(state => {
    const activeCue = state.cues[state.active_cue_index];
    if (activeCue && activeCue.background && prop !== 'dataUrl') {
      activeCue.background[prop] = parseFloat(value);
    }
  });
};

// 배경 삭제
(window as any).deleteBackground = () => {
  commitHistory();
  setState(state => {
    const activeCue = state.cues[state.active_cue_index];
    if (activeCue) {
      activeCue.background = undefined;
    }
  });
};

// ==========================================
// 신규: 드래그 앤 드롭 (Drag & Drop) 이벤트 핸들러
// ==========================================

(window as any).handleDragStart = (e: DragEvent) => {
  const target = e.currentTarget as HTMLElement;
  draggedIndex = parseInt(target.getAttribute('data-index') || '-1', 10);
  
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
  }
  // 드래그 시작 시 원본 요소의 시각적 피드백
  target.style.opacity = '0.4';
};

(window as any).handleDragOver = (e: DragEvent) => {
  // 기본 이벤트를 막아야 drop 이벤트가 발생함
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
};

(window as any).handleDragEnter = (e: DragEvent) => {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  if (target.classList.contains('list-item')) {
    // 마우스가 올라간 위치에 삽입될 것이라는 시각적 표시 (파란색 상단 테두리)
    target.style.boxShadow = 'inset 0 3px 0 #0d6efd';
  }
};

(window as any).handleDragLeave = (e: DragEvent) => {
  const target = e.currentTarget as HTMLElement;
  if (target.classList.contains('list-item')) {
    // 마우스가 빠져나가면 시각적 표시 제거
    target.style.boxShadow = '';
  }
};

(window as any).handleDrop = (e: DragEvent) => {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.style.boxShadow = ''; // 시각적 표시 제거

  const dropIndex = parseInt(target.getAttribute('data-index') || '-1', 10);

  // 제자리에 떨구지 않았고, 유효한 인덱스일 경우에만 상태 업데이트
  if (draggedIndex !== null && draggedIndex !== -1 && dropIndex !== -1 && draggedIndex !== dropIndex) {
    commitHistory();

    setState(state => {
      // 1. 현재 포커스된 씬의 고유 ID를 기억 (배열 순서가 바뀌어도 포커스를 유지하기 위함)
      const activeCueId = state.cues[state.active_cue_index].cue_id;

      // 2. 배열 순서 재배치 (splice 활용)
      const [movedCue] = state.cues.splice(draggedIndex!, 1);
      state.cues.splice(dropIndex, 0, movedCue);

      // 3. 기억해둔 ID를 기반으로 active_cue_index를 재조정
      state.active_cue_index = state.cues.findIndex(c => c.cue_id === activeCueId);
    });
  }
};

(window as any).handleDragEnd = (e: DragEvent) => {
  const target = e.currentTarget as HTMLElement;
  target.style.opacity = '1';
  draggedIndex = null;
};


// scene 이름을 수정할 수 있게 하기
(window as any).renameCue = (idx: number, event: Event) => {
  event.stopPropagation(); // 씬 선택(클릭) 이벤트가 같이 실행되는 것을 방지
  
  const state = getState();
  const cue = state.cues[idx];
  
  // 프롬프트 창을 띄워 새 이름을 입력받음
  const newLabel = prompt("씬 이름을 입력하세요:", cue.label);
  
  // 취소를 누르지 않았고, 빈 칸이 아닐 경우에만 업데이트
  if (newLabel !== null && newLabel.trim() !== "") {
    commitHistory();
    setState(s => {
      s.cues[idx].label = newLabel.trim();
    });
  }
};

// 구독 등록: 상태가 변하면 씬 목록 다시 그리기
export const initSceneUI = () => {
  subscribe(renderSceneList);
  renderSceneList(); // 초기 렌더링
};
