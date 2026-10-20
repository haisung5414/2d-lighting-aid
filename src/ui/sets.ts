// src/ui/sets.ts
// 세트(무대 위 덩어리) 목록과 속성 편집. 2D 화면에서 끌어서 옮기고, 3D 화면에 상자로 보인다.

import { commitHistory, getState, setState, subscribe } from '../state/store';
import type { SetPiece } from '../types';

let isPanelOpen = false;

const generateId = () => `set_${Math.random().toString(36).substring(2, 11)}`;

export const getSetPieces = (): SetPiece[] => getState().stage_config.set_pieces ?? [];

const createSetPiece = (index: number): SetPiece => {
  const stage = getState().stage_config;
  return {
    id: generateId(),
    label: `세트 ${index}`,
    x: stage.width / 2,
    y: Math.min(stage.depth, 4),
    width: 2,
    depth: 1,
    height: 0.4,
    rotation: 0,
    color: '#6b5a4a'
  };
};

const numberField = (label: string, prop: keyof SetPiece, value: number, step: number) => `
  <label class='inline-control-field'>${label}
    <input type='number' step='${step}' value='${Number(value.toFixed(2))}' onchange="updateSetProp('${prop}', this.value)">
  </label>
`;

const renderSelectedSet = (piece: SetPiece) => `
  <div class='control-group set-properties'>
    <label class='inline-control-field'>이름
      <input type='text' value='${piece.label.replace(/'/g, '&#39;')}' onchange="updateSetProp('label', this.value)">
    </label>
    <div class='inline-control-row'>
      ${numberField('X 중심 (m)', 'x', piece.x, 0.1)}
      ${numberField('Y 중심 (m)', 'y', piece.y, 0.1)}
      ${numberField('폭 (m)', 'width', piece.width, 0.1)}
      ${numberField('깊이 (m)', 'depth', piece.depth, 0.1)}
      ${numberField('높이 (m)', 'height', piece.height, 0.1)}
      ${numberField('회전 (°)', 'rotation', piece.rotation, 15)}
    </div>
    <label class='inline-control-field'>색
      <input type='color' value='${piece.color}' onchange="updateSetProp('color', this.value)">
    </label>
  </div>
`;

export const renderSetPanel = () => {
  const panel = document.getElementById('set-panel');
  if (!panel) return;

  const state = getState();
  const pieces = getSetPieces();
  const selected = pieces.find(piece => piece.id === state.selected_set_id);

  panel.innerHTML = `
    <details class="collapsible-section set-panel-body" ${isPanelOpen ? 'open' : ''}>
      <summary class="panel-header collapsible-summary">세트 (무대 위 덩어리) ${pieces.length > 0 ? `<small>${pieces.length}개</small>` : ''}</summary>
      <div class="collapsible-body">
        <p class="set-hint">세트는 왼쪽 도구(세트 그리기, 벽, 덧마루, 애플박스)로 놓습니다. 2D 화면에서 끌어서 옮길 수 있고, 모든 씬에 공통으로 적용됩니다.</p>
        ${pieces.map(piece => `
          <div class="list-item ${piece.id === state.selected_set_id ? 'active' : ''}" onclick="selectSetPiece('${piece.id}')">
            <span style="flex:1"><span class="gel-swatch" style="background:${piece.color}"></span>${piece.label}
              <br><small>${piece.width}×${piece.depth}m, 높이 ${piece.height}m</small></span>
            <button class="btn-danger" onclick="deleteSetPiece('${piece.id}', event)">X</button>
          </div>
        `).join('')}
        ${selected ? renderSelectedSet(selected) : ''}
      </div>
    </details>
  `;

  panel.querySelector<HTMLDetailsElement>('.set-panel-body')?.addEventListener('toggle', event => {
    isPanelOpen = (event.currentTarget as HTMLDetailsElement).open;
  });
};

(window as any).addSetPiece = () => {
  commitHistory();
  setState(s => {
    const pieces = s.stage_config.set_pieces ?? (s.stage_config.set_pieces = []);
    const piece = createSetPiece(pieces.length + 1);
    pieces.push(piece);
    s.selected_set_id = piece.id;
  });
};

(window as any).selectSetPiece = (id: string) => {
  setState(s => { s.selected_set_id = id; });
};

(window as any).deleteSetPiece = (id: string, event: Event) => {
  event.stopPropagation();
  commitHistory();
  setState(s => {
    s.stage_config.set_pieces = (s.stage_config.set_pieces ?? []).filter(piece => piece.id !== id);
    if (s.selected_set_id === id) s.selected_set_id = null;
  });
};

(window as any).updateSetProp = (prop: keyof SetPiece, value: string) => {
  commitHistory();
  setState(s => {
    const piece = (s.stage_config.set_pieces ?? []).find(item => item.id === s.selected_set_id);
    if (!piece) return;
    if (prop === 'label' || prop === 'color') {
      piece[prop] = value;
      return;
    }
    if (prop === 'id' || prop === 'kind') return;
    const num = parseFloat(value);
    if (!Number.isFinite(num)) return;
    if (prop === 'width' || prop === 'depth' || prop === 'height') {
      piece[prop] = Math.max(0.05, num);
    } else {
      piece[prop] = num;
    }
  });
};

export const initSetUI = () => {
  subscribe(renderSetPanel);
  renderSetPanel();
};
