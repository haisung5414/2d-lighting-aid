// src/ui/properties.ts
// "선택한 객체 속성" 패널. 고른 대상에 따라 내용이 바뀐다.
//   조명: 이름, 채널, 위치, 조준점 (나머지는 "조명 설정" 패널)
//   세트: 종류, 이름, 중심, 가로·깊이·높이(mm), 회전, 색
//   사람 모형: 이름, 위치, 키(얼굴 높이는 키에서 계산), 의상 색, 그리고 이 자리의 밝기 (예전 "밝기 Probe" 패널을 대신함)
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §5.3

import { ACTOR_FACE_OFFSET, DEFAULT_COSTUME_COLOR, actorFaceHeight, commitHistory, getCurrentCue, getState, setState, subscribe } from '../state/store';
import { GeometryEngine } from '../engine/geometry';
import { gelDisplayHex, toDisplayHex } from '../engine/gels';
import { getSelectionKind, openSelected, selectFixture } from './selection';
import { updateFixtureProp } from './fixture';
import { deleteSetPiece, setShownInScene, updateSetPiece } from './sets';
import { isActorShown, isSetShown } from '../state/sceneVisibility';
import type { SetPieceKind } from '../types';

const SET_KIND_LABELS: Record<SetPieceKind, string> = {
  set: '세트 그리기로 만듦',
  wall: '벽 바로가기로 만듦',
  deck: '덧마루 바로가기로 만듦',
  apple: '애플박스 바로가기로 만듦'
};

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const num = (v: number, digits = 2) => Number(v.toFixed(digits));
const lux = (v: number) => Number.isFinite(v) ? Math.round(v).toLocaleString('ko-KR') : '0';

const field = (label: string, control: string) => `<div class="pp-row"><span>${label}</span><div class="pp-ctl">${control}</div></div>`;
const numInput = (id: string, value: number, step = 0.1, unit = '') =>
  `<label class="pp-num"><input type="number" id="${id}" step="${step}" value="${value}">${unit ? `<small>${unit}</small>` : ''}</label>`;

const fixtureBody = () => {
  const cue = getCurrentCue();
  const fix = cue?.fixtures.find(f => f.id === getState().selected_fixture_id);
  if (!fix) return '';
  return `
    ${field('이름', `<input type="text" id="pp-label" value="${esc(fix.label)}">`)}
    ${field('채널', numInput('pp-channel', fix.channel ?? 0, 1))}
    ${field('위치 (m)', numInput('pp-px', num(fix.position.x)) + numInput('pp-py', num(fix.position.y)) + numInput('pp-pz', num(fix.position.z), 0.1, '높이'))}
    ${field('조준점 (m)', numInput('pp-tx', num(fix.target.x)) + numInput('pp-ty', num(fix.target.y)))}
    <p class="pp-note">기종·젤·디머·셔터·그림자는 "조명 설정"에 있습니다. 조명을 두 번 눌러도 열립니다.</p>
    <button type="button" class="sbtn" id="pp-open-ls">조명 설정 열기</button>`;
};

const setBody = () => {
  const s = getState();
  const piece = (s.stage_config.set_pieces ?? []).find(p => p.id === s.selected_set_id);
  if (!piece) return '';
  const mm = (v: number) => Math.round(v * 1000);
  return `
    <div class="pp-kind">세트 · ${SET_KIND_LABELS[piece.kind ?? 'set']}</div>
    ${field('이름', `<input type="text" id="pp-set-label" value="${esc(piece.label)}">`)}
    ${field('중심 (m)', numInput('pp-sx', num(piece.x)) + numInput('pp-sy', num(piece.y)))}
    ${field('가로·깊이', numInput('pp-sw', mm(piece.width), 10, 'mm') + numInput('pp-sd', mm(piece.depth), 10, 'mm'))}
    ${field('높이', numInput('pp-sh', mm(piece.height), 10, 'mm'))}
    ${field('회전', numInput('pp-sr', Math.round(piece.rotation), 15, '°'))}
    ${field('색', `<input type="color" id="pp-scolor" value="${piece.color}">`)}
    ${field('이 씬에서', `<label class="toggle-row"><input type="checkbox" id="pp-scene-visible" ${isSetShown(getCurrentCue(), piece) ? 'checked' : ''}> 보이기</label>`)}
    <p class="pp-note">세트는 모든 씬이 함께 씁니다. 숨기면 지금 씬에서만 사라지고 빛도 가리지 않습니다.</p>
    <button type="button" class="del-btn" id="pp-delete">이 세트 지우기</button>`;
};

const actorBody = () => {
  const state = getState();
  const cue = getCurrentCue();
  const actor = state.actors.find(a => a.id === state.selected_actor_id);
  if (!actor) return '';
  const face = actorFaceHeight(actor);
  const result = cue ? GeometryEngine.calculateProbeBrightness(cue, state.stage_config, actor, face) : null;
  const active = result ? result.contributions.filter(c => c.faceLux >= 1 || c.horizontalLux >= 1).slice(0, 8) : [];
  const blocked = result ? result.contributions.filter(c => c.blockedByShutter || c.blockedBySet).length : 0;
  return `
    ${field('이름', `<input type="text" id="pp-alabel" value="${esc(actor.label)}">`)}
    ${field('위치 (m)', numInput('pp-ax', num(actor.x)) + numInput('pp-ay', num(actor.y)))}
    ${field('키', numInput('pp-aheight', Math.round(actor.height * 1000), 10, 'mm'))}
    ${field('얼굴 높이', `<span class="pp-ro">${Math.round(face * 1000)} mm <small>(키 − ${Math.round(ACTOR_FACE_OFFSET * 1000)} mm, 밝기를 재는 높이)</small></span>`)}
    ${field('의상 색', `<input type="color" id="pp-costume" value="${actor.costume_color ?? DEFAULT_COSTUME_COLOR}">`)}
    ${field('이 씬에서', `<label class="toggle-row"><input type="checkbox" id="pp-scene-visible" ${isActorShown(cue, actor) ? 'checked' : ''}> 보이기</label>`)}
    <div class="pp-sub">이 자리의 밝기</div>
    ${result ? `
      <div class="pp-lux"><span class="gel-dot big" style="background:${result.faceLux >= 1 ? toDisplayHex(result.faceRgb) : '#000'}" title="얼굴에 닿는 빛의 색"></span>
        <strong>${lux(result.faceLux)}</strong><span>lux · 얼굴 (객석 방향)</span></div>
      <div class="pp-lux-sub">수평면 (머리 위·바닥) ${lux(result.horizontalLux)} lux</div>
      ${active.length ? `<div class="pp-contrib"><div class="pp-contrib-head"><span>조명</span><span>얼굴 / 수평 lux</span></div>
        ${active.map(c => `<button type="button" data-contrib="${c.fixtureId}"><span><span class="gel-dot" style="background:${gelDisplayHex(c.gel)}"></span>${esc(c.label)}${c.estimated ? ' <small class="est">추정</small>' : ''}</span><span>${lux(c.faceLux)} / ${lux(c.horizontalLux)}</span></button>`).join('')}</div>`
        : '<p class="pp-note">이 자리에 닿는 조명이 없습니다.</p>'}
      ${blocked ? `<p class="pp-note">셔터나 세트에 가려진 조명 ${blocked}개</p>` : ''}` : ''}
    <button type="button" class="del-btn" id="pp-delete">이 사람 모형 지우기</button>`;
};

export const renderProperties = () => {
  const body = document.getElementById('props-body');
  if (!body) return;
  const kind = getSelectionKind();
  body.innerHTML = kind === 'fixture' ? fixtureBody()
    : kind === 'set' ? setBody()
      : kind === 'actor' ? actorBody()
        : '<p class="pp-empty">무대에서 조명, 세트, 사람 모형 중 하나를 누르세요.</p>';

  const bind = (id: string, handler: (el: HTMLInputElement) => void) => {
    const el = body.querySelector<HTMLInputElement>(`#${id}`);
    el?.addEventListener('change', () => handler(el));
  };

  const state = getState();
  if (kind === 'fixture' && state.selected_fixture_id) {
    const fid = state.selected_fixture_id;
    bind('pp-label', el => updateFixtureProp(fid, 'label', el.value));
    bind('pp-channel', el => updateFixtureProp(fid, 'channel', el.value));
    bind('pp-px', el => updateFixtureProp(fid, 'position', el.value, 'x'));
    bind('pp-py', el => updateFixtureProp(fid, 'position', el.value, 'y'));
    bind('pp-pz', el => updateFixtureProp(fid, 'position', el.value, 'z'));
    bind('pp-tx', el => updateFixtureProp(fid, 'target', el.value, 'x'));
    bind('pp-ty', el => updateFixtureProp(fid, 'target', el.value, 'y'));
    body.querySelector('#pp-open-ls')?.addEventListener('click', () => openSelected());
  }
  if (kind === 'set' && state.selected_set_id) {
    const sid = state.selected_set_id;
    const mm = (el: HTMLInputElement) => parseFloat(el.value) / 1000;
    bind('pp-set-label', el => updateSetPiece(sid, 'label', el.value));
    bind('pp-sx', el => updateSetPiece(sid, 'x', el.value));
    bind('pp-sy', el => updateSetPiece(sid, 'y', el.value));
    bind('pp-sw', el => updateSetPiece(sid, 'width', mm(el)));
    bind('pp-sd', el => updateSetPiece(sid, 'depth', mm(el)));
    bind('pp-sh', el => updateSetPiece(sid, 'height', mm(el)));
    bind('pp-sr', el => updateSetPiece(sid, 'rotation', el.value));
    bind('pp-scolor', el => updateSetPiece(sid, 'color', el.value));
    bind('pp-scene-visible', el => setShownInScene('set', sid, el.checked));
    body.querySelector('#pp-delete')?.addEventListener('click', () => deleteSetPiece(sid));
  }
  if (kind === 'actor' && state.selected_actor_id) {
    const aid = state.selected_actor_id;
    const updateActor = (fn: (a: (typeof state.actors)[number], s: typeof state) => void) => {
      commitHistory();
      setState(s => {
        const actor = s.actors.find(a => a.id === aid);
        if (actor) fn(actor, s);
      });
    };
    bind('pp-alabel', el => updateActor(a => { const t = el.value.trim(); if (t) a.label = t; }));
    bind('pp-ax', el => updateActor((a, s) => { const v = parseFloat(el.value); if (Number.isFinite(v)) a.x = Math.min(s.stage_config.width, Math.max(0, v)); }));
    bind('pp-ay', el => updateActor((a, s) => { const v = parseFloat(el.value); if (Number.isFinite(v)) a.y = Math.min(s.stage_config.depth, Math.max(0, v)); }));
    bind('pp-aheight', el => updateActor(a => { const v = parseFloat(el.value) / 1000; if (Number.isFinite(v)) a.height = Math.min(2.5, Math.max(0.5, v)); }));
    bind('pp-costume', el => updateActor(a => { a.costume_color = el.value; }));
    bind('pp-scene-visible', el => setShownInScene('actor', aid, el.checked));
    body.querySelectorAll<HTMLButtonElement>('[data-contrib]').forEach(button => {
      button.addEventListener('click', () => selectFixture(button.dataset.contrib!));
    });
    body.querySelector('#pp-delete')?.addEventListener('click', () => deleteActor(aid));
  }
};

/** 사람 모형을 지운다 (실행 취소 가능) */
export const deleteActor = (id: string) => {
  commitHistory();
  setState(s => {
    s.actors = s.actors.filter(a => a.id !== id);
    if (s.selected_actor_id === id) s.selected_actor_id = null;
  });
};

export const initProperties = () => {
  subscribe(renderProperties);
  renderProperties();
};
