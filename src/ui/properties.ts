// src/ui/properties.ts
// "선택한 객체 속성" 패널. 고른 대상에 따라 내용이 바뀐다.
//   조명: 이름, 채널, 위치, 조준점 (나머지는 "조명 설정" 패널)
//   세트: 종류, 이름, 중심, 가로·깊이·높이(mm), 회전, 색
//   사람 모형: 위치, 얼굴 높이, 의상 색, 그리고 이 자리의 밝기 (예전 "밝기 Probe" 패널을 대신함)
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §5.3

import { DEFAULT_COSTUME_COLOR, commitHistory, getCurrentCue, getState, setState, subscribe } from '../state/store';
import { GeometryEngine } from '../engine/geometry';
import { gelDisplayHex, toDisplayHex } from '../engine/gels';
import { getSelectionKind, selectFixture } from './selection';
import { updateFixtureProp } from './fixture';
import { updateSetPiece } from './sets';
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
    <p class="pp-note">기종·젤·디머·셔터·그림자는 조명을 누르면 위에서 펼쳐지는 "조명 설정"에 있습니다.</p>`;
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
    ${field('색', `<input type="color" id="pp-scolor" value="${piece.color}">`)}`;
};

const actorBody = () => {
  const state = getState();
  const cue = getCurrentCue();
  const probe = state.probe;
  const result = cue ? GeometryEngine.calculateProbeBrightness(cue, state.stage_config, probe) : null;
  const active = result ? result.contributions.filter(c => c.faceLux >= 1 || c.horizontalLux >= 1).slice(0, 8) : [];
  const blocked = result ? result.contributions.filter(c => c.blockedByShutter || c.blockedBySet).length : 0;
  return `
    ${field('위치 (m)', numInput('pp-ax', num(probe.x)) + numInput('pp-ay', num(probe.y)))}
    ${field('얼굴 높이', `<span class="pp-ro">${state.stage_config.actor_height} m <small>(공연장 정보에서 바꿈)</small></span>`)}
    ${field('의상 색', `<input type="color" id="pp-costume" value="${probe.costume_color ?? DEFAULT_COSTUME_COLOR}">`)}
    ${field('무대에 보이기', `<label class="toggle-row"><input type="checkbox" id="pp-visible" ${probe.is_visible ? 'checked' : ''}> 보이기</label>`)}
    <div class="pp-sub">이 자리의 밝기</div>
    ${result ? `
      <div class="pp-lux"><span class="gel-dot big" style="background:${result.faceLux >= 1 ? toDisplayHex(result.faceRgb) : '#000'}" title="얼굴에 닿는 빛의 색"></span>
        <strong>${lux(result.faceLux)}</strong><span>lux · 얼굴 (객석 방향)</span></div>
      <div class="pp-lux-sub">수평면 (머리 위·바닥) ${lux(result.horizontalLux)} lux</div>
      ${active.length ? `<div class="pp-contrib"><div class="pp-contrib-head"><span>조명</span><span>얼굴 / 수평 lux</span></div>
        ${active.map(c => `<button type="button" data-contrib="${c.fixtureId}"><span><span class="gel-dot" style="background:${gelDisplayHex(c.gel)}"></span>${esc(c.label)}${c.estimated ? ' <small class="est">추정</small>' : ''}</span><span>${lux(c.faceLux)} / ${lux(c.horizontalLux)}</span></button>`).join('')}</div>`
        : '<p class="pp-note">이 자리에 닿는 조명이 없습니다.</p>'}
      ${blocked ? `<p class="pp-note">셔터나 세트에 가려진 조명 ${blocked}개</p>` : ''}` : ''}`;
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
  }
  if (kind === 'actor') {
    const updateProbe = (fn: (p: typeof state.probe, s: typeof state) => void) => { commitHistory(); setState(s => fn(s.probe, s)); };
    bind('pp-ax', el => updateProbe((p, s) => { const v = parseFloat(el.value); if (Number.isFinite(v)) p.x = Math.min(s.stage_config.width, Math.max(0, v)); }));
    bind('pp-ay', el => updateProbe((p, s) => { const v = parseFloat(el.value); if (Number.isFinite(v)) p.y = Math.min(s.stage_config.depth, Math.max(0, v)); }));
    bind('pp-costume', el => updateProbe(p => { p.costume_color = el.value; }));
    bind('pp-visible', el => updateProbe(p => { p.is_visible = el.checked; }));
    body.querySelectorAll<HTMLButtonElement>('[data-contrib]').forEach(button => {
      button.addEventListener('click', () => selectFixture(button.dataset.contrib!));
    });
  }
};

export const initProperties = () => {
  subscribe(renderProperties);
  renderProperties();
};
