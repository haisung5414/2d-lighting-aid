import { HUMANITIES_PATCH_CHANNELS, HUMANITIES_PATCH_ROWS } from '../config/patch';
import { getState, subscribe } from '../state/store';

interface ChannelAssignment {
  cueLabel: string;
  fixtureLabel: string;
}

let isPatchPanelOpen = false;
let selectedChannel: number | null = null;

const getChannelAssignments = (): Record<number, ChannelAssignment[]> => {
  const assignments: Record<number, ChannelAssignment[]> = {};

  getState().cues.forEach(cue => {
    cue.fixtures.forEach(fixture => {
      const channel = fixture.channel ?? 0;
      if (channel <= 0) return;

      if (!assignments[channel]) assignments[channel] = [];
      assignments[channel].push({
        cueLabel: cue.label,
        fixtureLabel: fixture.label
      });
    });
  });

  return assignments;
};

const renderDetailHtml = (channel: number | null, assignmentsByChannel: Record<number, ChannelAssignment[]>): string => {
  if (channel === null) {
    return '<div class="patch-detail-empty">채널을 선택하면 배정 목록이 표시됩니다.</div>';
  }

  const spec = HUMANITIES_PATCH_CHANNELS[channel];
  if (!spec) {
    return `<div class="patch-detail-empty">채널 ${channel} 정보가 없습니다.</div>`;
  }

  const assignments = assignmentsByChannel[channel] ?? [];
  const list = assignments.length
    ? assignments.map(item => `<li><strong>${item.cueLabel}</strong> / ${item.fixtureLabel}</li>`).join('')
    : '<li>배정된 조명이 없습니다.</li>';

  return `
    <div class="patch-detail-title">${channel}번 채널</div>
    <div class="patch-detail-meta">${spec.location} / 콘센트 ${spec.capacity}개 / 전체 씬 참조 ${assignments.length}개</div>
    <ul class="patch-detail-list">${list}</ul>
  `;
};

export const renderPatchUI = () => {
  const panelEl = document.getElementById('patch-bay-panel');
  if (!panelEl) return;

  const assignmentsByChannel = getChannelAssignments();

  if (!isPatchPanelOpen) {
    panelEl.innerHTML = `
      <button class="panel-header patch-header patch-toggle" type="button" aria-expanded="false">
        <span>채널 사용 현황</span>
        <span>열기</span>
      </button>
    `;
  } else {
    panelEl.innerHTML = `
      <button class="panel-header patch-header patch-toggle" type="button" aria-expanded="true">
        <span>채널 사용 현황</span>
        <span>닫기</span>
      </button>
      <div class="patch-note">전체 씬 기준 참조 수입니다. 복사된 조명도 별도 항목으로 집계됩니다.</div>
      <div id="patch-detail" class="patch-detail">
        ${renderDetailHtml(selectedChannel, assignmentsByChannel)}
      </div>
      <div class="patch-grid">
        ${HUMANITIES_PATCH_ROWS.map(row => `
          <section class="patch-row">
            <div class="patch-row-label">${row.label}</div>
            <div class="patch-row-cells">
              ${row.channels.map(spec => {
                const count = assignmentsByChannel[spec.channel]?.length ?? 0;
                const statusClass = count === 0 ? 'empty' : count > spec.capacity ? 'over' : 'used';
                const selectedClass = selectedChannel === spec.channel ? 'selected' : '';
                return `
                  <button
                    class="patch-cell ${statusClass} ${selectedClass}"
                    type="button"
                    title="${spec.location} / 콘센트 ${spec.capacity}개 / 참조 ${count}개"
                    data-channel="${spec.channel}"
                  >
                    <span class="patch-channel">${spec.channel}</span>
                    <span class="patch-count">${count}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    `;
  }

  panelEl.querySelector<HTMLButtonElement>('.patch-toggle')?.addEventListener('click', () => {
    isPatchPanelOpen = !isPatchPanelOpen;
    renderPatchUI();
  });

  panelEl.querySelectorAll<HTMLButtonElement>('.patch-cell').forEach(button => {
    button.addEventListener('click', () => {
      selectedChannel = Number(button.dataset.channel);
      renderPatchUI();
    });
  });
};

export const initPatchUI = () => {
  subscribe(renderPatchUI);
  renderPatchUI();
};
