// src/ui/patch.ts
// "채널 검사" 패널: 극장의 채널(디머 회로)마다 배정된 조명 수를 보여 주고, 넘치는 채널을 빨갛게 표시한다.

import { HUMANITIES_PATCH_CHANNELS, HUMANITIES_PATCH_ROWS } from '../config/patch';
import { getState, subscribe } from '../state/store';

interface ChannelAssignment {
  cueLabel: string;
  fixtureLabel: string;
}

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
    return '<div class="patch-detail-empty">칸을 누르면 그 채널에 배정된 조명이 여기에 나옵니다.</div>';
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

/** 한 줄에 놓는 칸 수. 가장 긴 줄(무대 1층 12채널)이 줄바꿈 없이 들어가게 모든 줄을 같은 격자로 맞춘다 */
const COLUMNS = Math.max(...HUMANITIES_PATCH_ROWS.map(row => row.channels.length));

export const renderPatchUI = () => {
  const panelEl = document.getElementById('patch-bay-panel');
  if (!panelEl) return;

  const assignmentsByChannel = getChannelAssignments();

  panelEl.innerHTML = `
    <div class="patch-head">
      <b>채널 사용 현황</b>
      <span class="info" tabindex="0" aria-describedby="patch-tip">
        <span class="info-icon" aria-hidden="true">i</span>
        <span class="info-tip" role="tooltip" id="patch-tip">
          조명이 어느 <b>채널(디머 회로)</b>에 꽂혀 있는지, 그 채널이 이미 차 있는지 아직 비어 있는지 확인하는 표입니다.<br>
          칸 하나가 채널 하나이고, 아래 숫자는 그 채널에 배정된 조명 수입니다 (모든 씬을 합친 수, 복사한 조명도 따로 셉니다).<br>
          조명의 채널은 "선택한 객체 속성"에서 정합니다. 칸을 누르면 어느 씬의 어떤 조명이 쓰는지 나옵니다.
        </span>
      </span>
    </div>
    <div class="patch-legend">
      <span><i class="sw empty"></i>비어 있음</span>
      <span><i class="sw used"></i>사용 중</span>
      <span><i class="sw over"></i>콘센트보다 많음</span>
    </div>
    <div class="patch-grid" style="--patch-cols:${COLUMNS}">
      ${HUMANITIES_PATCH_ROWS.map(row => `
        <section class="patch-row">
          <div class="patch-row-label">${row.label}</div>
          <div class="patch-row-cells">
            ${row.channels.map(spec => {
              const count = assignmentsByChannel[spec.channel]?.length ?? 0;
              const statusClass = count === 0 ? 'empty' : count > spec.capacity ? 'over' : 'used';
              const selectedClass = selectedChannel === spec.channel ? 'selected' : '';
              return `<button class="patch-cell ${statusClass} ${selectedClass}" type="button"
                  title="${spec.channel}번 채널 · ${spec.location} · 콘센트 ${spec.capacity}개 · 배정 ${count}개"
                  data-channel="${spec.channel}">
                  <span class="patch-channel">${spec.channel}</span>
                  <span class="patch-count">${count}</span>
                </button>`;
            }).join('')}
          </div>
        </section>
      `).join('')}
    </div>
    <div id="patch-detail" class="patch-detail">
      ${renderDetailHtml(selectedChannel, assignmentsByChannel)}
    </div>
  `;

  panelEl.querySelectorAll<HTMLButtonElement>('.patch-cell').forEach(button => {
    button.addEventListener('click', () => {
      const channel = Number(button.dataset.channel);
      selectedChannel = selectedChannel === channel ? null : channel;
      renderPatchUI();
    });
  });
};

export const initPatchUI = () => {
  subscribe(renderPatchUI);
  renderPatchUI();
};
