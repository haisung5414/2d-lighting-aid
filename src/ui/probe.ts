import { GeometryEngine } from '../engine/geometry';
import { getCurrentCue, getState, setState, subscribe, commitHistory } from '../state/store';
import { DEFAULT_LAMP, LAMP_OPTIONS } from '../engine/photometrics';
import type { LampKey } from '../types';

const formatNumber = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '0.0';
let isProbePanelOpen = true;

const ensureProbePanel = (): HTMLElement | null => {
  let panel = document.getElementById('probe-panel');
  if (panel) return panel;

  const patchPanel = document.getElementById('patch-bay-panel');
  if (!patchPanel?.parentElement) return null;

  panel = document.createElement('div');
  panel.id = 'probe-panel';
  patchPanel.parentElement.insertBefore(panel, patchPanel);
  return panel;
};

const formatLux = (value: number) => Number.isFinite(value) ? Math.round(value).toLocaleString('ko-KR') : '0';

const renderContributionList = (result: ReturnType<typeof GeometryEngine.calculateProbeBrightness>) => {
  const activeItems = result.contributions.filter(item => item.faceLux >= 1 || item.horizontalLux >= 1);
  if (activeItems.length === 0) {
    return '<div class="probe-empty">이 지점에 도달하는 조명이 없습니다.</div>';
  }

  return `
    <div class="probe-contribution-list">
      <div class="probe-contribution probe-contribution-head">
        <span class="probe-fixture-label">조명</span>
        <span class="probe-fixture-value">얼굴 / 수평 lux</span>
      </div>
      ${activeItems.slice(0, 8).map(item => `
        <div class="probe-contribution">
          <span class="probe-fixture-label">${item.label}${item.estimated ? ' <span class="probe-estimated" title="사양서가 없어 추정한 값">추정</span>' : ''}</span>
          <span class="probe-fixture-value">${formatLux(item.faceLux)} / ${formatLux(item.horizontalLux)}</span>
        </div>
      `).join('')}
    </div>
  `;
};

const renderLampSelect = (current: LampKey) => `
  <label class="probe-lamp">램프
    <select id="probe-lamp">
      ${(Object.keys(LAMP_OPTIONS) as LampKey[]).map(key =>
        `<option value="${key}" ${key === current ? 'selected' : ''}>${LAMP_OPTIONS[key].label}</option>`
      ).join('')}
    </select>
  </label>
`;

export const renderProbeUI = () => {
  const panel = ensureProbePanel();
  if (!panel) return;

  const state = getState();
  const cue = getCurrentCue();
  if (!cue) {
    panel.innerHTML = '';
    return;
  }

  const result = GeometryEngine.calculateProbeBrightness(cue, state.stage_config, state.probe);
  const blockedCount = result.contributions.filter(item => item.blockedByShutter).length;

  panel.innerHTML = `
    <details class="probe-panel-body" ${isProbePanelOpen ? 'open' : ''}>
      <summary class="panel-header probe-header">밝기 Probe</summary>
      <div class="probe-content">
        <label class="toggle-row probe-toggle">
          <input type="checkbox" id="probe-visible" ${state.probe.is_visible ? 'checked' : ''}> Probe 표시
        </label>
        ${renderLampSelect(state.stage_config.lamp ?? DEFAULT_LAMP)}
        <div class="probe-total">
          <span>얼굴 (객석 방향, 높이 ${formatNumber(result.actorHeight, 2)}m)</span>
          <strong>${formatLux(result.faceLux)} lux</strong>
        </div>
        <div class="probe-subtotal">
          <span>수평면 (머리 위·바닥이 받는 빛)</span>
          <span>${formatLux(result.horizontalLux)} lux</span>
        </div>
        ${renderContributionList(result)}
        ${blockedCount > 0 ? `<div class="probe-note">셔터로 차단된 조명 ${blockedCount}개</div>` : ''}
      </div>
    </details>
  `;

  const lampSelect = document.getElementById('probe-lamp') as HTMLSelectElement | null;
  lampSelect?.addEventListener('change', e => {
    const target = e.target as HTMLSelectElement;
    commitHistory();
    setState(s => {
      s.stage_config.lamp = target.value as LampKey;
    });
  });

  const visibleInput = document.getElementById('probe-visible') as HTMLInputElement | null;
  visibleInput?.addEventListener('change', e => {
    const target = e.target as HTMLInputElement;
    commitHistory();
    setState(s => {
      s.probe.is_visible = target.checked;
    });
  });

  panel.querySelector<HTMLDetailsElement>('.probe-panel-body')?.addEventListener('toggle', event => {
    const details = event.currentTarget as HTMLDetailsElement;
    isProbePanelOpen = details.open;
  });
};

(window as any).updateProbeProp = (prop: 'x' | 'y', value: string) => {
  const numVal = parseFloat(value);
  if (!Number.isFinite(numVal)) return;

  commitHistory();
  setState(state => {
    if (prop === 'x') state.probe.x = Math.min(state.stage_config.width, Math.max(0, numVal));
    if (prop === 'y') state.probe.y = Math.min(state.stage_config.depth, Math.max(0, numVal));
  });
};

export const initProbeUI = () => {
  subscribe(renderProbeUI);
  renderProbeUI();
};
