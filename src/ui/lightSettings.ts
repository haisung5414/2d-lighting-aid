// src/ui/lightSettings.ts
// "조명 설정" 패널: 조명을 고를 때마다 트레이 맨 위에서 펼쳐진다.
// 정확히 다섯 가지만 둔다: 기종·렌즈, 젤, 디머, 셔터, 3D 그림자. (이름·채널·위치·조준점은 "선택한 객체 속성")
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §5.2

import { getCurrentCue, getSelectedFixture, subscribe } from '../state/store';
import { GeometryEngine, ZoomAngleRanges } from '../engine/geometry';
import { MAX_SHADOW_FIXTURES, dimmerLevel, getPhotometry } from '../engine/photometrics';
import { GELS, gelDisplayHex, getGel } from '../engine/gels';
import { FIXTURE_TYPE_LABELS, updateFixtureProp, type LensChoice } from './fixture';
import type { Fixture } from '../types';

const LENS_OPTIONS: { value: LensChoice; label: string }[] = [
  { value: '19deg', label: '19°' },
  { value: '26deg', label: '26°' },
  { value: '36deg', label: '36°' },
  { value: '51deg', label: '50°' },
  { value: 'zoom-narrow', label: '줌 15~30°' },
  { value: 'zoom-medium', label: '줌 25~50°' }
];

/** 극장에 있는 PAR 램프는 MFL뿐이라 고르지 않고 보여 주기만 한다 (예전 파일의 다른 램프는 store가 MFL로 바꾼다) */
const PAR_LAMP_LABEL = 'MFL · 중간 (25×12°)';

const currentLens = (fix: Fixture): LensChoice | null => {
  if (fix.type === 'ellipsoidal') return fix.lens_type;
  if (fix.type === 'zoom') return fix.zoom_range === 'narrow' ? 'zoom-narrow' : 'zoom-medium';
  return null;
};

const angleNote = (fix: Fixture) => {
  const spec = GeometryEngine.getFixtureAngleSpec(fix);
  const est = getPhotometry(fix).estimated ? ' · 추정값' : '';
  return `빔 ${Math.round(spec.beam * 2)}° · 필드 ${Math.round(spec.field * 2)}°${est}`;
};

const kindSection = (fix: Fixture) => {
  if (fix.type === 'ellipsoidal' || fix.type === 'zoom') {
    const lens = currentLens(fix);
    const zoom = fix.type === 'zoom'
      ? (() => {
          const range = ZoomAngleRanges[fix.zoom_range];
          return `<div class="ls-row"><span>줌 각도</span>
            <div class="ls-slider"><input type="range" id="ls-zoom" min="${range.min}" max="${range.max}" step="1" value="${fix.zoom_angle}"><output id="ls-zoom-out">${Math.round(fix.zoom_angle)}°</output></div></div>`;
        })()
      : '';
    return `<div class="ls-row"><span>렌즈</span>
        <select id="ls-lens">${LENS_OPTIONS.map(o => `<option value="${o.value}" ${o.value === lens ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
      ${zoom}`;
  }
  if (fix.type === 'fresnel') {
    return `<div class="ls-row"><span>포커스</span>
      <div class="ls-slider"><small>좁게</small><input type="range" id="ls-focus" min="0" max="1" step="0.05" value="${fix.focus_level}"><small>넓게</small></div></div>`;
  }
  return `<div class="ls-row"><span>램프</span><span class="ls-fixed">${PAR_LAMP_LABEL}</span></div>
    <div class="ls-row"><span>회전</span>
      <div class="ls-slider"><input type="range" id="ls-rotation" min="0" max="179" step="1" value="${fix.rotation_angle}"><output id="ls-rotation-out">${Math.round(fix.rotation_angle)}°</output></div></div>`;
};

const gelSection = (fix: Fixture) => {
  const gel = getGel(fix.gel);
  return `<div class="ls-gel-current"><span class="gel-dot" style="background:${gelDisplayHex(fix.gel)}"></span>${gel ? `L${gel.code} ${gel.name} · 투과 ${gel.transmission.toFixed(0)}%` : '젤 없음 (텅스텐 그대로)'}</div>
    <div class="ls-gels" role="group" aria-label="젤 고르기">
      ${GELS.map(g => `<button type="button" class="${fix.gel === g.code ? 'on' : ''}" data-gel="${g.code}" style="background:${gelDisplayHex(g.code)}" title="L${g.code} ${g.name} (투과 ${g.transmission.toFixed(0)}%)" aria-label="L${g.code} ${g.name}"></button>`).join('')}
      <button type="button" class="none ${fix.gel ? '' : 'on'}" data-gel="" title="젤 없음" aria-label="젤 없음">✕</button>
    </div>`;
};

const dimmerSection = (fix: Fixture) => {
  const level = dimmerLevel(fix);
  return `<div class="ls-slider"><input type="range" id="ls-dimmer" min="0" max="100" step="5" value="${level}"><output id="ls-dimmer-out">${level.toFixed(0)}%</output></div>
    <p class="ls-note">실제 광량 약 <span id="ls-dimmer-real">${Math.round(Math.pow(level / 100, 2) * 100)}</span>% (텅스텐 제곱 법칙)</p>`;
};

const shutterSection = (fix: Fixture) => {
  if (!GeometryEngine.fixtureHasShutters(fix)) {
    return `<label class="toggle-row is-disabled"><input type="checkbox" disabled> 이 기종에는 셔터가 없습니다</label>`;
  }
  return `<label class="toggle-row"><input type="checkbox" id="ls-shutter" ${fix.shutter_active ? 'checked' : ''}> 셔터 켜기</label>
    ${fix.shutter_active ? '<p class="ls-note">무대의 빨간 꼭짓점 4개를 끌어 빛을 자르세요.</p>' : ''}`;
};

const shadowSection = (fix: Fixture) => {
  const used = (getCurrentCue()?.fixtures ?? []).filter(f => f.cast_shadow && f.id !== fix.id).length;
  const full = !fix.cast_shadow && used >= MAX_SHADOW_FIXTURES;
  return `<label class="toggle-row ${full ? 'is-disabled' : ''}"><input type="checkbox" id="ls-shadow" ${fix.cast_shadow ? 'checked' : ''} ${full ? 'disabled' : ''}> 3D에서 이 조명의 그림자 계산</label>
    <p class="ls-note">세트·객석·사람 모형이 빛을 가리는 모습을 3D에서 보여 줍니다. 최대 ${MAX_SHADOW_FIXTURES}개${full ? ' (이미 다 쓰는 중)' : ` (지금 ${used + (fix.cast_shadow ? 1 : 0)}개)`}.</p>`;
};

export const renderLightSettings = () => {
  const body = document.getElementById('light-settings-body');
  const title = document.getElementById('light-settings-title');
  if (!body) return;
  const fix = getSelectedFixture();
  if (!fix) { body.innerHTML = ''; return; }

  if (title) title.textContent = `조명 설정 · ${fix.label}`;
  body.innerHTML = `
    <section class="ls-section"><h3>기종·렌즈 <small>${FIXTURE_TYPE_LABELS[fix.type]} · ${angleNote(fix)}</small></h3>${kindSection(fix)}</section>
    <section class="ls-section"><h3>젤</h3>${gelSection(fix)}</section>
    <section class="ls-section"><h3>디머</h3>${dimmerSection(fix)}</section>
    <section class="ls-section"><h3>셔터</h3>${shutterSection(fix)}</section>
    <section class="ls-section"><h3>3D 그림자</h3>${shadowSection(fix)}</section>`;

  const id = fix.id;
  const on = <T extends HTMLElement>(sel: string, ev: string, fn: (el: T) => void) => {
    const el = body.querySelector<T>(sel);
    el?.addEventListener(ev, () => fn(el));
  };
  on<HTMLSelectElement>('#ls-lens', 'change', el => updateFixtureProp(id, 'lens', el.value));
  on<HTMLInputElement>('#ls-zoom', 'input', el => { body.querySelector('#ls-zoom-out')!.textContent = `${el.value}°`; });
  on<HTMLInputElement>('#ls-zoom', 'change', el => updateFixtureProp(id, 'zoom_angle', el.value));
  on<HTMLInputElement>('#ls-focus', 'change', el => updateFixtureProp(id, 'focus_level', el.value));
  on<HTMLInputElement>('#ls-rotation', 'input', el => { body.querySelector('#ls-rotation-out')!.textContent = `${el.value}°`; });
  on<HTMLInputElement>('#ls-rotation', 'change', el => updateFixtureProp(id, 'rotation_angle', el.value));
  on<HTMLInputElement>('#ls-dimmer', 'input', el => {
    body.querySelector('#ls-dimmer-out')!.textContent = `${el.value}%`;
    body.querySelector('#ls-dimmer-real')!.textContent = String(Math.round(Math.pow(Number(el.value) / 100, 2) * 100));
  });
  on<HTMLInputElement>('#ls-dimmer', 'change', el => updateFixtureProp(id, 'level', el.value));
  on<HTMLInputElement>('#ls-shutter', 'change', el => updateFixtureProp(id, 'shutter_active', el.checked));
  on<HTMLInputElement>('#ls-shadow', 'change', el => updateFixtureProp(id, 'cast_shadow', el.checked));
  body.querySelectorAll<HTMLButtonElement>('[data-gel]').forEach(button => {
    button.addEventListener('click', () => updateFixtureProp(id, 'gel', button.dataset.gel ?? ''));
  });
};

export const initLightSettings = () => {
  subscribe(renderLightSettings);
  renderLightSettings();
};
