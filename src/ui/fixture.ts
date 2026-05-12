// src/ui/fixture.ts
import { getState, setState, getCurrentCue, getSelectedFixture, subscribe, commitHistory } from '../state/store';
import { LensData } from '../engine/geometry';
import type { LensType } from '../types';

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).substring(2, 11)}`;

export const renderFixtureUI = () => {
  renderList();
  renderProperties();
};

const renderList = () => {
  const fixListEl = document.getElementById('fixture-list');
  if (!fixListEl) return;

  const currentCue = getCurrentCue();
  const state = getState();
  if (!currentCue) {
    fixListEl.innerHTML = "";
    return;
  }

  let html = "";
  currentCue.fixtures.forEach(fix => {
    const isActive = state.selected_fixture_ids.includes(fix.id) ? 'active' : '';
    const eyeIcon = fix.is_visible !== false ? '👁️' : '🕶️';
    const opacity = fix.is_visible !== false ? '1' : '0.5';

    html += `<div class='list-item ${isActive}' style='opacity:${opacity}' onclick="selectFixture('${fix.id}', event)">
               <span style='flex:1'>${fix.label}</span>
               <div style='display:flex; gap:2px;'>
                 <button class='btn-icon' title='Toggle Visibility' onclick="toggleFixVis('${fix.id}', event)">${eyeIcon}</button>
                 <button class='btn-danger' onclick="deleteFixture('${fix.id}', event)">X</button>
               </div>
             </div>`;
  });
  fixListEl.innerHTML = html;
};

const renderProperties = () => {
  const propsPanel = document.getElementById('fixture-properties');
  if (!propsPanel) return;

  const selectedFix = getSelectedFixture();
  if (!selectedFix) {
    propsPanel.innerHTML = "<div style='color: #888; text-align: center; padding: 20px;'>조명을 선택해주세요.</div>";
    return;
  }

  let lensOptions = "";
  (Object.keys(LensData) as LensType[]).forEach(lens => {
    const sel = selectedFix.lens_type === lens ? "selected" : "";
    lensOptions += `<option value='${lens}' ${sel}>${lens}</option>`;
  });

  // 변경점 1: 체크박스의 인라인 속성(onchange)을 제거하고 고유 id('prop-shutter') 부여
  propsPanel.innerHTML = `
    <div class='control-group'>
      <label>Position (X, Y, Z m)</label>
      <div class='control-row'>
        <input type='number' step='0.5' value='${selectedFix.position.x.toFixed(2)}' onchange="updateFixProp('position', 'x', this.value)">
        <input type='number' step='0.5' value='${selectedFix.position.y.toFixed(2)}' onchange="updateFixProp('position', 'y', this.value)">
        <input type='number' step='0.5' value='${selectedFix.position.z}' onchange="updateFixProp('position', 'z', this.value)">
      </div>
    </div>
    <div class='control-group'>
      <label>Lens Type</label>
      <select onchange="updateFixProp('lens_type', null, this.value)">${lensOptions}</select>
    </div>
    <div class='control-group' style='background: #e7f1ff; border-color: #b6d4fe;'>
      <label class='toggle-row' style='margin:0; font-weight:bold; color:#084298;'>
        <input type='checkbox' id='prop-shutter' ${selectedFix.shutter_active ? "checked" : ""}> Enable Shutter (Masking)
      </label>
    </div>
    <div class='control-group'>
      <label>Edge Softness: ${selectedFix.edge_softness}</label>
      <input type='range' min='0' max='30' value='${selectedFix.edge_softness}' oninput="updateFixProp('edge_softness', null, this.value)">
    </div>
  `;

  // 변경점 2: DOM 렌더링 직후 요소에 직접 접근하여 이벤트 리스너 부착
  const shutterCheck = document.getElementById('prop-shutter') as HTMLInputElement;
  if (shutterCheck) {
    shutterCheck.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      (window as any).updateFixProp('shutter_active', null, target.checked);
    });
  }
};

// 전역 이벤트 핸들러 등록
(window as any).addFixture = () => {
  commitHistory();

  setState(state => {
    const cue = state.cues[state.active_cue_index];
    if (!cue) return;
    const newId = generateId('fixture');
    cue.fixtures.push({
      id: newId,
      label: `L${cue.fixtures.length + 1} (New)`,
      lens_type: "36deg",
      position: { x: state.stage_config.width / 2, y: 1, z: state.stage_config.default_z },
      target: { x: state.stage_config.width / 2, y: state.stage_config.depth / 2 },
      shutter_active: false,
      is_visible: true,
      shutter_polygon: [{ dx: -1.5, dy: -1.5 }, { dx: 1.5, dy: -1.5 }, { dx: 1.5, dy: 1.5 }, { dx: -1.5, dy: 1.5 }],
      edge_softness: 5
    });
    state.selected_fixture_id = newId;
    state.selected_fixture_ids = [newId];
  });
};

(window as any).selectFixture = (id: string, event?: MouseEvent) => {
  setState(state => {
    if (event?.ctrlKey || event?.metaKey) {
      if (state.selected_fixture_ids.includes(id)) {
        state.selected_fixture_ids = state.selected_fixture_ids.filter(selectedId => selectedId !== id);
        if (state.selected_fixture_id === id) {
          state.selected_fixture_id = state.selected_fixture_ids[0] ?? null;
        }
      } else {
        state.selected_fixture_ids.push(id);
        state.selected_fixture_id = id;
      }
      return;
    }

    state.selected_fixture_id = id;
    state.selected_fixture_ids = [id];
  });
};

(window as any).toggleFixVis = (id: string, event: Event) => {
  event.stopPropagation();
  commitHistory();

  setState(state => {
    const cue = state.cues[state.active_cue_index];
    const fix = cue?.fixtures.find(f => f.id === id);
    if (fix) fix.is_visible = !fix.is_visible;
  });
};

(window as any).deleteFixture = (id: string, event: Event) => {
  event.stopPropagation();
  commitHistory();

  setState(state => {
    const cue = state.cues[state.active_cue_index];
    if (!cue) return;
    cue.fixtures = cue.fixtures.filter(f => f.id !== id);
    state.selected_fixture_ids = state.selected_fixture_ids.filter(selectedId => selectedId !== id);
    if (state.selected_fixture_id === id) {
      state.selected_fixture_id = cue.fixtures.length > 0 ? cue.fixtures[0].id : null;
      state.selected_fixture_ids = state.selected_fixture_id ? [state.selected_fixture_id] : [];
    }
  });
};

(window as any).updateFixProp = (prop: keyof import('../types').Fixture, subProp: 'x'|'y'|'z'|null, value: any) => {
  commitHistory();
  
  setState(state => {
    const cue = state.cues[state.active_cue_index];
    const fix = cue?.fixtures.find(f => f.id === state.selected_fixture_id);
    if (!fix) return;

    if (prop === 'shutter_active' || prop === 'lens_type') {
      (fix as any)[prop] = value;
    } else {
      const numVal = parseFloat(value);
      if (subProp && prop === 'position') {
        fix.position[subProp] = numVal;
      } else if (prop === 'edge_softness') {
        fix.edge_softness = numVal;
      }
    }
  });
};

export const initFixtureUI = () => {
  subscribe(renderFixtureUI);
  renderFixtureUI();
};
