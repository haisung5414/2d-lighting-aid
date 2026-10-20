// src/ui/scene.ts
// 아래 씬 서랍의 내용(씬 카드 줄과 새 씬 / 복사 / 이름 변경 / 삭제)과
// "레이어" 패널 안의 씬 배경 이미지 조절을 그린다. 서랍을 여닫는 동작은 shell.ts가 맡는다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §6

import { getState, setState, subscribe, commitHistory } from '../state/store';
import { generateThumbnail } from '../render/canvas';
import type { BackgroundImage, Cue } from '../types';

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).substring(2, 11)}`;
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** 이름을 고치고 있는 씬 (입력칸이 다시 그려져 사라지지 않게 한다) */
let renamingCueId: string | null = null;
/** 삭제 버튼을 한 번 누른 상태: 한 번 더 누르면 지운다 */
let deleteArmed = false;
let deleteArmTimer: number | undefined;
/** 끌어서 옮기는 중인 씬의 순서 */
let draggedIndex: number | null = null;

const drawerOpen = () => !(document.getElementById('scene-body')?.hidden ?? true);

/* ---------- 씬 조작 ---------- */

const selectCue = (idx: number) => {
  if (idx === getState().active_cue_index) return;
  setState(state => {
    state.active_cue_index = idx;
    state.selected_fixture_id = null; // 씬을 바꾸면 선택을 비운다
  });
};

const addCue = () => {
  commitHistory();
  setState(state => {
    state.cues.push({ cue_id: generateId('cue'), label: `Scene ${state.cues.length + 1}`, fixtures: [] });
    state.active_cue_index = state.cues.length - 1;
    state.selected_fixture_id = null;
  });
};

/** 지금 씬을 바로 뒤에 복사한다 (조명 구성 포함) */
const copyCue = () => {
  commitHistory();
  setState(state => {
    const idx = state.active_cue_index;
    const source = state.cues[idx];
    if (!source) return;
    const copy: Cue = JSON.parse(JSON.stringify(source));
    copy.cue_id = generateId('cue');
    copy.label = `${source.label} 복사본`;
    copy.fixtures.forEach(f => { f.id = generateId('fixture'); });
    state.cues.splice(idx + 1, 0, copy);
    state.active_cue_index = idx + 1;
    state.selected_fixture_id = null;
  });
};

const deleteCue = () => {
  commitHistory();
  setState(state => {
    if (state.cues.length <= 1) return;
    state.cues.splice(state.active_cue_index, 1);
    state.active_cue_index = Math.min(state.active_cue_index, state.cues.length - 1);
    state.selected_fixture_id = null;
  });
};

const renameCue = (cueId: string, label: string) => {
  const text = label.trim();
  const cue = getState().cues.find(c => c.cue_id === cueId);
  if (!cue || !text || text === cue.label) return;
  commitHistory();
  setState(state => {
    const target = state.cues.find(c => c.cue_id === cueId);
    if (target) target.label = text;
  });
};

const moveCue = (from: number, to: number) => {
  if (from === to) return;
  commitHistory();
  setState(state => {
    const activeId = state.cues[state.active_cue_index]?.cue_id;
    const [moved] = state.cues.splice(from, 1);
    state.cues.splice(to, 0, moved);
    state.active_cue_index = Math.max(0, state.cues.findIndex(c => c.cue_id === activeId));
  });
};

/* ---------- 씬 카드 줄 ---------- */

const disarmDelete = () => {
  deleteArmed = false;
  window.clearTimeout(deleteArmTimer);
};

export const renderSceneList = () => {
  const list = document.getElementById('cue-list');
  if (!list || !drawerOpen()) return;
  // 이름을 입력하는 동안에는 다시 그리지 않는다
  if (renamingCueId && list.querySelector('.scene-rename')) return;

  const state = getState();
  // 썸네일은 그 씬이 바뀔 때 store가 만든다. 열고 나서 한 번도 바뀌지 않은 씬은 여기서 채운다
  state.cues.forEach(cue => {
    if (!cue.thumbnail) cue.thumbnail = generateThumbnail(cue, state.stage_config, state.ui_toggles);
  });
  list.innerHTML = state.cues.map((cue, idx) => {
    const current = idx === state.active_cue_index;
    const thumb = cue.thumbnail ? `<img src="${cue.thumbnail}" alt="">` : '';
    const name = cue.cue_id === renamingCueId
      ? `<input type="text" class="scene-rename" value="${esc(cue.label)}" aria-label="씬 이름">`
      : `<b>${esc(cue.label)}</b>`;
    return `<div class="scene-card ${current ? 'sel' : ''}" draggable="${cue.cue_id !== renamingCueId}" data-index="${idx}" role="button" tabindex="0" aria-pressed="${current}" title="누르면 이 씬으로 바뀝니다. 끌어서 순서를 바꿉니다.">
      <span class="scene-thumb">${thumb}</span>${name}<small>조명 ${cue.fixtures.length}개</small>
    </div>`;
  }).join('');

  const single = state.cues.length <= 1;
  const del = document.getElementById('scene-delete') as HTMLButtonElement | null;
  if (del) {
    del.disabled = single;
    del.title = single ? '씬이 하나뿐이라 지울 수 없습니다' : '지금 씬을 지웁니다 (실행 취소로 되돌릴 수 있음)';
    del.textContent = deleteArmed && !single ? '한 번 더 누르면 삭제' : '삭제';
    del.classList.toggle('armed', deleteArmed && !single);
  }

  list.querySelectorAll<HTMLElement>('.scene-card').forEach(card => {
    const idx = Number(card.dataset.index);
    card.addEventListener('click', () => { disarmDelete(); selectCue(idx); });
    card.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); selectCue(idx); }
    });
    card.querySelector('b')?.addEventListener('dblclick', () => startRename(state.cues[idx].cue_id));

    card.addEventListener('dragstart', e => {
      draggedIndex = idx;
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragover', e => {
      if (draggedIndex === null) return;
      e.preventDefault();
      // 카드 가운데를 기준으로 앞·뒤 어느 쪽에 끼울지 보여 준다
      const rect = card.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      card.classList.toggle('drop-before', !after);
      card.classList.toggle('drop-after', after);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      const after = card.classList.contains('drop-after');
      card.classList.remove('drop-before', 'drop-after');
      if (draggedIndex === null) return;
      let to = idx + (after ? 1 : 0);
      if (draggedIndex < to) to -= 1;
      moveCue(draggedIndex, to);
    });
    card.addEventListener('dragend', () => {
      draggedIndex = null;
      list.querySelectorAll('.scene-card').forEach(c => c.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
  });

  const input = list.querySelector<HTMLInputElement>('.scene-rename');
  if (input) {
    const id = renamingCueId!;
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      renamingCueId = null;
      if (save) renameCue(id, input.value);
      renderSceneList();
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation(); // 도구 단축키가 먹지 않게
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', e => e.stopPropagation());
    input.focus();
    input.select();
  }
};

/** 카드 이름을 그 자리에서 입력칸으로 바꾼다 (prompt 창을 쓰지 않음) */
const startRename = (cueId: string) => {
  renamingCueId = cueId;
  const list = document.getElementById('cue-list');
  list?.querySelector('.scene-rename')?.remove(); // 다른 입력칸이 있으면 치운다
  renderSceneList();
};

const initSceneButtons = () => {
  document.getElementById('scene-add')?.addEventListener('click', () => { disarmDelete(); addCue(); });
  document.getElementById('scene-copy')?.addEventListener('click', () => { disarmDelete(); copyCue(); });
  document.getElementById('scene-rename')?.addEventListener('click', () => {
    disarmDelete();
    const cue = getState().cues[getState().active_cue_index];
    if (cue) startRename(cue.cue_id);
  });
  document.getElementById('scene-delete')?.addEventListener('click', () => {
    if (getState().cues.length <= 1) return;
    if (!deleteArmed) {
      // 확인 문구를 보여 주고, 3초 안에 한 번 더 누르면 지운다
      deleteArmed = true;
      window.clearTimeout(deleteArmTimer);
      deleteArmTimer = window.setTimeout(() => { deleteArmed = false; renderSceneList(); }, 3000);
      renderSceneList();
      return;
    }
    disarmDelete();
    deleteCue();
  });
  // 서랍이 열릴 때 목록을 그린다 (shell.ts가 hidden을 바꾼 뒤)
  document.getElementById('scene-handle')?.addEventListener('click', () => {
    disarmDelete();
    // 실제 클릭에서는 마이크로태스크가 shell.ts 리스너보다 먼저 돌아서, 다음 작업으로 미룬다
    window.setTimeout(renderSceneList, 0);
  });
};

/* ---------- 레이어 패널: 이 씬의 배경 이미지 ---------- */

let lastBackgroundKey = '';

const renderBackgroundUI = () => {
  const host = document.getElementById('bg-settings-container');
  if (!host) return;
  const state = getState();
  const cue = state.cues[state.active_cue_index];
  const bg = cue?.background;
  // 값이 그대로면 다시 그리지 않는다 (슬라이더를 끄는 중에 입력칸이 바뀌지 않게)
  const key = `${cue?.cue_id}|${bg ? `${bg.x},${bg.y},${bg.width},${bg.height},${bg.opacity},${bg.dataUrl.length}` : 'none'}`;
  if (key === lastBackgroundKey) return;
  lastBackgroundKey = key;

  const num = (prop: keyof BackgroundImage, value: number, label: string) =>
    `<label class="pp-num"><small>${label}</small><input type="number" step="0.1" data-bg="${prop}" value="${value}"></label>`;

  host.innerHTML = bg
    ? `<div class="pp-sub">이 씬의 배경 이미지</div>
      <div class="pp-row"><span>위치 (m)</span><div class="pp-ctl">${num('x', bg.x, 'X')}${num('y', bg.y, 'Y')}</div></div>
      <div class="pp-row"><span>크기 (m)</span><div class="pp-ctl">${num('width', bg.width, '가로')}${num('height', bg.height, '세로')}</div></div>
      <div class="pp-row"><span>투명도</span><div class="ls-slider"><input type="range" min="0" max="1" step="0.05" data-bg="opacity" value="${bg.opacity}"><output>${Math.round(bg.opacity * 100)}%</output></div></div>
      <button type="button" class="sbtn danger" id="bg-delete">배경 이미지 지우기</button>`
    : `<div class="pp-sub">이 씬의 배경 이미지</div>
      <input type="file" id="bg-upload" accept="image/png, image/jpeg, image/webp" hidden>
      <button type="button" class="sbtn" id="bg-upload-btn">배경 이미지 올리기</button>`;

  host.querySelectorAll<HTMLInputElement>('[data-bg]').forEach(input => {
    const prop = input.dataset.bg as Exclude<keyof BackgroundImage, 'dataUrl'>;
    if (input.type === 'range') {
      // 끄는 동안에는 숫자만 바꾸고, 놓을 때 한 번 저장한다
      input.addEventListener('input', () => {
        const out = input.parentElement?.querySelector('output');
        if (out) out.textContent = `${Math.round(Number(input.value) * 100)}%`;
      });
    }
    input.addEventListener('change', () => {
      const value = parseFloat(input.value);
      if (!Number.isFinite(value)) return;
      commitHistory();
      setState(s => {
        const target = s.cues[s.active_cue_index]?.background;
        if (target) target[prop] = value;
      });
    });
  });
  host.querySelector('#bg-delete')?.addEventListener('click', () => {
    commitHistory();
    setState(s => {
      const target = s.cues[s.active_cue_index];
      if (target) target.background = undefined;
    });
  });
  const upload = host.querySelector<HTMLInputElement>('#bg-upload');
  host.querySelector('#bg-upload-btn')?.addEventListener('click', () => upload?.click());
  upload?.addEventListener('change', () => {
    const file = upload.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      commitHistory();
      setState(s => {
        const target = s.cues[s.active_cue_index];
        if (target) {
          // 기본값: 무대에 꽉 차게, 반투명
          target.background = { dataUrl, x: 0, y: 0, width: s.stage_config.width, height: s.stage_config.depth, opacity: 0.5 };
        }
      });
    };
    reader.readAsDataURL(file);
    upload.value = '';
  });
};

export const initSceneUI = () => {
  initSceneButtons();
  subscribe(renderSceneList);
  subscribe(renderBackgroundUI);
  renderSceneList();
  renderBackgroundUI();
};
