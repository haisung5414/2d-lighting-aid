// src/ui/stageList.ts
// "무대 위 목록" 패널: 조명 / 세트 / 사람 모형을 나무 구조로 보여 준다.
// 줄을 누르면 무대에서 고르고, 줄 끝 버튼으로 숨기거나 지운다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §5.1

import { commitHistory, getCurrentCue, getState, setState, subscribe } from '../state/store';
import { gelDisplayHex } from '../engine/gels';
import { dimmerLevel } from '../engine/photometrics';
import { FIXTURE_TYPE_LABELS, deleteFixture, toggleFixtureVisible } from './fixture';
import { deleteSetPiece } from './sets';
import { getSelectionKind, selectActor, selectFixture, selectSet } from './selection';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 7.6A17 17 0 0 0 2 12s4 7 10 7a9.4 9.4 0 0 0 4.5-1.1"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

export const renderStageList = () => {
  const body = document.getElementById('list-body');
  if (!body) return;
  const state = getState();
  const cue = getCurrentCue();
  const fixtures = cue?.fixtures ?? [];
  const sets = state.stage_config.set_pieces ?? [];
  const kind = getSelectionKind();

  const fixtureRows = fixtures.map(f => {
    const selected = kind === 'fixture' && state.selected_fixture_id === f.id;
    const level = dimmerLevel(f);
    return `<div class="sl-row ${selected ? 'sel' : ''} ${f.is_visible === false ? 'hidden-item' : ''}">
      <button type="button" class="sl-main" data-fixture="${f.id}">
        <span class="gel-dot" style="background:${gelDisplayHex(f.gel)}"></span>
        <span class="sl-name">${esc(f.label)}</span>
        <small>ch ${f.channel || '—'} · ${FIXTURE_TYPE_LABELS[f.type]}${level < 100 ? ` · ${level.toFixed(0)}%` : ''}</small>
      </button>
      <button type="button" class="sl-act" data-fixture-vis="${f.id}" title="${f.is_visible === false ? '보이기' : '숨기기'}" aria-label="${f.is_visible === false ? '보이기' : '숨기기'}">${f.is_visible === false ? EYE_OFF : EYE}</button>
      <button type="button" class="sl-act danger" data-fixture-del="${f.id}" title="지우기" aria-label="지우기">${TRASH}</button>
    </div>`;
  }).join('');

  const setRows = sets.map(p => {
    const selected = kind === 'set' && state.selected_set_id === p.id;
    return `<div class="sl-row ${selected ? 'sel' : ''}">
      <button type="button" class="sl-main" data-set="${p.id}">
        <span class="gel-dot square" style="background:${p.color}"></span>
        <span class="sl-name">${esc(p.label)}</span>
        <small>높이 ${Math.round(p.height * 1000)} mm</small>
      </button>
      <button type="button" class="sl-act danger" data-set-del="${p.id}" title="지우기" aria-label="지우기">${TRASH}</button>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="sl-group"><span>조명</span><small>${fixtures.length}</small></div>
    ${fixtureRows || '<p class="sl-empty">왼쪽 도구로 조명을 놓으세요.</p>'}
    <div class="sl-group"><span>세트</span><small>${sets.length}</small></div>
    ${setRows || '<p class="sl-empty">왼쪽 도구로 세트·벽·덧마루를 놓으세요.</p>'}
    <div class="sl-group"><span>사람 모형</span></div>
    <div class="sl-row ${kind === 'actor' ? 'sel' : ''} ${state.probe.is_visible ? '' : 'hidden-item'}">
      <button type="button" class="sl-main" data-actor><span class="gel-dot actor"></span><span class="sl-name">배우 자리</span><small>X ${state.probe.x.toFixed(1)} · Y ${state.probe.y.toFixed(1)}</small></button>
      <button type="button" class="sl-act" data-actor-vis title="${state.probe.is_visible ? '숨기기' : '보이기'}" aria-label="${state.probe.is_visible ? '숨기기' : '보이기'}">${state.probe.is_visible ? EYE : EYE_OFF}</button>
    </div>`;

  body.querySelectorAll<HTMLElement>('[data-fixture]').forEach(el => el.addEventListener('click', () => selectFixture(el.dataset.fixture!)));
  body.querySelectorAll<HTMLElement>('[data-fixture-vis]').forEach(el => el.addEventListener('click', () => toggleFixtureVisible(el.dataset.fixtureVis!)));
  body.querySelectorAll<HTMLElement>('[data-fixture-del]').forEach(el => el.addEventListener('click', () => deleteFixture(el.dataset.fixtureDel!)));
  body.querySelectorAll<HTMLElement>('[data-set]').forEach(el => el.addEventListener('click', () => selectSet(el.dataset.set!)));
  body.querySelectorAll<HTMLElement>('[data-set-del]').forEach(el => el.addEventListener('click', () => deleteSetPiece(el.dataset.setDel!)));
  body.querySelector('[data-actor]')?.addEventListener('click', () => selectActor());
  body.querySelector('[data-actor-vis]')?.addEventListener('click', () => {
    commitHistory();
    setState(s => { s.probe.is_visible = !s.probe.is_visible; });
  });
};

export const initStageList = () => {
  subscribe(renderStageList);
  renderStageList();
};
