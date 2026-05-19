// src/ui/fixture.ts

import { getState, setState, getCurrentCue, getSelectedFixture, subscribe, commitHistory } from '../state/store';
import { GeometryEngine, LensData, ParData, ZoomAngleRanges } from '../engine/geometry';
import type { Fixture, FixtureType, FresnelFocus, LensType, ParLampType, ShutterPoint, ZoomRangeType } from '../types';

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).substring(2, 11)}`;

const shutterPolygon = (): [ShutterPoint, ShutterPoint, ShutterPoint, ShutterPoint] => [
  { dx: -1.5, dy: -1.5 },
  { dx: 1.5, dy: -1.5 },
  { dx: 1.5, dy: 1.5 },
  { dx: -1.5, dy: 1.5 }
];

const fixtureTypeLabels: Record<FixtureType, string> = {
  ellipsoidal: 'Fixed Ellipsoidal',
  zoom: 'Zoom Ellipsoidal',
  fresnel: 'Fresnel',
  par: 'PAR'
};

const fixturePropertySectionsOpen = {
  position: false,
  optics: false
};

const focusLabel = (level: number): FresnelFocus => {
  if (level < 0.25) return 'narrow';
  if (level > 0.75) return 'flood';
  return 'medium';
};

const createFixture = (type: FixtureType, index: number): Fixture => {
  const state = getState();
  const id = generateId('fixture');
  const base = {
    id,
    label: `L${index}`,
    channel: 0,
    type,
    position: { x: state.stage_config.width / 2, y: 1, z: state.stage_config.default_z },
    target: { x: state.stage_config.width / 2, y: state.stage_config.depth / 2 },
    is_visible: true,
    edge_softness: 0
  };

  if (type === 'zoom') {
    return { ...base, type, zoom_range: 'narrow', zoom_angle: 26, shutter_active: false, shutter_polygon: shutterPolygon() };
  }

  if (type === 'fresnel') {
    return { ...base, type, focus: 'medium', focus_level: 0.5 };
  }

  if (type === 'par') {
    return { ...base, type, lamp_type: 'MFL', rotation_angle: 0 };
  }

  return { ...base, type: 'ellipsoidal', lens_type: '36deg', shutter_active: false, shutter_polygon: shutterPolygon() };
};

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
    const visibilityLabel = fix.is_visible !== false ? '보기' : '숨김';
    const opacity = fix.is_visible !== false ? '1' : '0.5';

    html += `<div class='list-item ${isActive}' style='opacity:${opacity}' onclick="selectFixture('${fix.id}', event)">
               <span style='flex:1'>${fix.label}<br><small>${fixtureTypeLabels[fix.type]}</small></span>
               <div style='display:flex; gap:2px;'>
                 <button class='btn-icon' title='표시 전환' onclick="toggleFixVis('${fix.id}', event)">${visibilityLabel}</button>
                 <button class='btn-danger' onclick="deleteFixture('${fix.id}', event)">X</button>
               </div>
             </div>`;
  });
  fixListEl.innerHTML = html;
};

const renderFixedLensControl = (selectedFix: Extract<Fixture, { type: 'ellipsoidal' }>) => {
  const lensOptions = (Object.keys(LensData) as LensType[]).map(lens => {
    const sel = selectedFix.lens_type === lens ? "selected" : "";
    return `<option value='${lens}' ${sel}>${lens}</option>`;
  }).join('');

  return `
    <label class='inline-control-field'>Lens
      <select onchange="updateFixProp('lens_type', null, this.value)">${lensOptions}</select>
    </label>
  `;
};

const renderZoomControl = (selectedFix: Extract<Fixture, { type: 'zoom' }>) => {
  const range = ZoomAngleRanges[selectedFix.zoom_range];
  const rangeOptions = (Object.keys(ZoomAngleRanges) as ZoomRangeType[]).map(rangeType => {
    const sel = selectedFix.zoom_range === rangeType ? "selected" : "";
    return `<option value='${rangeType}' ${sel}>${ZoomAngleRanges[rangeType].label}</option>`;
  }).join('');

  return `
    <label class='inline-control-field'>Zoom Range
      <select onchange="updateFixProp('zoom_range', null, this.value)">${rangeOptions}</select>
    </label>
    <label class='inline-control-field'>Field Angle (${selectedFix.zoom_angle.toFixed(0)} deg)
      <input type='range' min='${range.min}' max='${range.max}' step='1' value='${selectedFix.zoom_angle}' onchange="updateFixProp('zoom_angle', null, this.value)">
    </label>
  `;
};

const renderFresnelControl = (selectedFix: Extract<Fixture, { type: 'fresnel' }>) => {
  const spec = GeometryEngine.getFixtureAngleSpec(selectedFix);
  return `
    <label class='inline-control-field'>Focus (${selectedFix.focus}, field ${(spec.field * 2).toFixed(0)} deg / beam ${(spec.beam * 2).toFixed(0)} deg)
      <input type='range' min='0' max='1' step='0.05' value='${selectedFix.focus_level}' onchange="updateFixProp('focus_level', null, this.value)">
    </label>
  `;
};

const renderParControl = (selectedFix: Extract<Fixture, { type: 'par' }>) => {
  const lampOptions = (Object.keys(ParData) as ParLampType[]).map(lamp => {
    const sel = selectedFix.lamp_type === lamp ? "selected" : "";
    return `<option value='${lamp}' ${sel}>${lamp}</option>`;
  }).join('');

  return `
    <label class='inline-control-field'>Lamp Type
      <select onchange="updateFixProp('lamp_type', null, this.value)">${lampOptions}</select>
    </label>
    <label class='inline-control-field'>Rotation (${selectedFix.rotation_angle.toFixed(0)} deg)
      <input type='range' min='0' max='180' step='1' value='${selectedFix.rotation_angle}' onchange="updateFixProp('rotation_angle', null, this.value)">
    </label>
  `;
};

const renderBeamControls = (selectedFix: Fixture) => {
  if (selectedFix.type === 'ellipsoidal') return renderFixedLensControl(selectedFix);
  if (selectedFix.type === 'zoom') return renderZoomControl(selectedFix);
  if (selectedFix.type === 'fresnel') return renderFresnelControl(selectedFix);
  return renderParControl(selectedFix);
};

const renderProperties = () => {
  const propsPanel = document.getElementById('fixture-properties');
  if (!propsPanel) return;

  const selectedFix = getSelectedFixture();
  if (!selectedFix) {
    propsPanel.innerHTML = "<div class='empty-state'>조명을 선택하세요.</div>";
    return;
  }

  const typeOptions = (Object.keys(fixtureTypeLabels) as FixtureType[]).map(type => {
    const sel = selectedFix.type === type ? "selected" : "";
    return `<option value='${type}' ${sel}>${fixtureTypeLabels[type]}</option>`;
  }).join('');

  const shutterControls = GeometryEngine.fixtureHasShutters(selectedFix)
    ? `<div class='control-group shutter-control'>
        <label class='toggle-row'>
          <input type='checkbox' id='prop-shutter' ${selectedFix.shutter_active ? "checked" : ""}> 셔터 컷 사용
        </label>
      </div>`
    : "";

  propsPanel.innerHTML = `
    <details class='control-group collapsible-control' data-section='position' ${fixturePropertySectionsOpen.position ? 'open' : ''}>
      <summary class='collapsible-control-summary'>위치 (X, Y, Z m)</summary>
      <div class='control-row'>
        <input type='number' step='0.5' value='${selectedFix.position.x.toFixed(2)}' onchange="updateFixProp('position', 'x', this.value)">
        <input type='number' step='0.5' value='${selectedFix.position.y.toFixed(2)}' onchange="updateFixProp('position', 'y', this.value)">
        <input type='number' step='0.5' value='${selectedFix.position.z}' onchange="updateFixProp('position', 'z', this.value)">
      </div>
    </details>
    <details class='control-group collapsible-control' data-section='optics' ${fixturePropertySectionsOpen.optics ? 'open' : ''}>
      <summary class='collapsible-control-summary'>채널 / 타입 / 광학</summary>
      <div class='inline-control-row'>
        <label class='inline-control-field'>Channel
          <input type='number' min='0' max='91' value='${selectedFix.channel ?? ""}' onchange="updateFixProp('channel', null, this.value)">
        </label>
        <label class='inline-control-field'>Fixture Type
          <select onchange="updateFixProp('type', null, this.value)">${typeOptions}</select>
        </label>
        ${renderBeamControls(selectedFix)}
      </div>
    </details>
    ${shutterControls}
  `;

  const shutterCheck = document.getElementById('prop-shutter') as HTMLInputElement | null;
  shutterCheck?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    (window as any).updateFixProp('shutter_active', null, target.checked);
  });

  propsPanel.querySelectorAll<HTMLDetailsElement>('.collapsible-control[data-section]').forEach(details => {
    details.addEventListener('toggle', () => {
      const section = details.dataset.section;
      if (section === 'position' || section === 'optics') {
        fixturePropertySectionsOpen[section] = details.open;
      }
    });
  });
};

(window as any).addFixture = (type?: FixtureType) => {
  commitHistory();

  setState(state => {
    const cue = state.cues[state.active_cue_index];
    if (!cue) return;
    const typeSelect = document.getElementById('fixture-add-type') as HTMLSelectElement | null;
    const fixtureType = type ?? (typeSelect?.value as FixtureType | undefined) ?? 'ellipsoidal';
    const fixture = createFixture(fixtureType, cue.fixtures.length + 1);
    cue.fixtures.push(fixture);
    state.selected_fixture_id = fixture.id;
    state.selected_fixture_ids = [fixture.id];
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

(window as any).updateFixProp = (prop: string, subProp: 'x'|'y'|'z'|null, value: any) => {
  commitHistory();

  setState(state => {
    const cue = state.cues[state.active_cue_index];
    const fix = cue?.fixtures.find(f => f.id === state.selected_fixture_id);
    if (!fix) return;

    if (prop === 'type') {
      const replacement = createFixture(value as FixtureType, cue!.fixtures.indexOf(fix) + 1);
      replacement.id = fix.id;
      replacement.label = fix.label;
      replacement.channel = fix.channel;
      replacement.position = fix.position;
      replacement.target = fix.target;
      replacement.is_visible = fix.is_visible;
      cue!.fixtures[cue!.fixtures.indexOf(fix)] = replacement;
      return;
    }

    if (prop === 'channel') {
      const channel = parseInt(value, 10);
      fix.channel = Number.isFinite(channel) ? Math.min(91, Math.max(0, channel)) : undefined;
      return;
    }

    if (prop === 'position' && subProp) {
      const numVal = parseFloat(value);
      if (Number.isFinite(numVal)) fix.position[subProp] = numVal;
      return;
    }

    if (prop === 'lens_type' && fix.type === 'ellipsoidal') fix.lens_type = value as LensType;
    if (prop === 'zoom_range' && fix.type === 'zoom') {
      fix.zoom_range = value as ZoomRangeType;
      const range = ZoomAngleRanges[fix.zoom_range];
      fix.zoom_angle = Math.min(range.max, Math.max(range.min, fix.zoom_angle));
    }
    if (prop === 'zoom_angle' && fix.type === 'zoom') {
      const range = ZoomAngleRanges[fix.zoom_range];
      fix.zoom_angle = Math.min(range.max, Math.max(range.min, parseFloat(value)));
    }
    if (prop === 'focus_level' && fix.type === 'fresnel') {
      fix.focus_level = Math.min(1, Math.max(0, parseFloat(value)));
      fix.focus = focusLabel(fix.focus_level);
    }
    if (prop === 'lamp_type' && fix.type === 'par') fix.lamp_type = value as ParLampType;
    if (prop === 'rotation_angle' && fix.type === 'par') fix.rotation_angle = parseFloat(value);
    if (prop === 'shutter_active' && GeometryEngine.fixtureHasShutters(fix)) fix.shutter_active = Boolean(value);
  });
};

export const initFixtureUI = () => {
  subscribe(renderFixtureUI);
  renderFixtureUI();
};
