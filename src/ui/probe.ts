import { GeometryEngine } from '../engine/geometry';
import { getCurrentCue, getState, setState, subscribe, commitHistory } from '../state/store';

const formatNumber = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '0.0';

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

const renderContributionList = (result: ReturnType<typeof GeometryEngine.calculateProbeBrightness>) => {
  const activeItems = result.contributions.filter(item => item.brightness > 0.01);
  if (activeItems.length === 0) {
    return '<div class="probe-empty">이 지점에 도달하는 조명이 없습니다.</div>';
  }

  return `
    <div class="probe-contribution-list">
      ${activeItems.slice(0, 8).map(item => `
        <div class="probe-contribution">
          <span class="probe-fixture-label">${item.label}</span>
          <span class="probe-fixture-value">${formatNumber(item.brightness)}</span>
        </div>
      `).join('')}
    </div>
  `;
};

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
    <details class="probe-panel-body" open>
      <summary class="panel-header probe-header">밝기 Probe (Prototype)</summary>
      <div class="probe-content">
        <label class="toggle-row probe-toggle">
          <input type="checkbox" id="probe-visible" ${state.probe.is_visible ? 'checked' : ''}> Probe 표시
        </label>
        <div class="probe-total">
          <span>배우 얼굴 높이 ${formatNumber(result.actorHeight, 2)}m</span>
          <strong>${formatNumber(result.total)} rel</strong>
        </div>
        ${renderContributionList(result)}
        ${blockedCount > 0 ? `<div class="probe-note">셔터로 차단된 조명 ${blockedCount}개</div>` : ''}
      </div>
    </details>
  `;

  const visibleInput = document.getElementById('probe-visible') as HTMLInputElement | null;
  visibleInput?.addEventListener('change', e => {
    const target = e.target as HTMLInputElement;
    commitHistory();
    setState(s => {
      s.probe.is_visible = target.checked;
    });
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
