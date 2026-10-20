// src/ui/fixture.ts
// 조명기 데이터 조작: 만들기, 지우기, 숨기기, 속성 바꾸기.
// 화면은 lightSettings.ts(조명 설정), properties.ts(선택한 객체 속성), stageList.ts(무대 위 목록)가 그린다.

import { setState, commitHistory } from '../state/store';
import { GeometryEngine, ZoomAngleRanges } from '../engine/geometry';
import { getGel } from '../engine/gels';
import type { Fixture, FixtureType, FresnelFocus, LensType, ParLampType, ShutterPoint, ZoomRangeType } from '../types';

const generateId = (prefix: string) => `${prefix}_${Math.random().toString(36).substring(2, 11)}`;

const shutterPolygon = (): [ShutterPoint, ShutterPoint, ShutterPoint, ShutterPoint] => [
  { dx: -1.5, dy: -1.5 },
  { dx: 1.5, dy: -1.5 },
  { dx: 1.5, dy: 1.5 },
  { dx: -1.5, dy: 1.5 }
];

export const FIXTURE_TYPE_LABELS: Record<FixtureType, string> = {
  ellipsoidal: '엘립소이달',
  zoom: '줌 엘립소이달',
  fresnel: '프레넬',
  par: 'PAR64'
};

const focusLabel = (level: number): FresnelFocus => {
  if (level < 0.25) return 'narrow';
  if (level > 0.75) return 'flood';
  return 'medium';
};

/** 지금 씬에서 아직 쓰지 않은 다음 조명 번호 (L1, L2, ...) */
export const nextFixtureNumber = (fixtures: Fixture[]): number =>
  fixtures.reduce((max, fixture) => {
    const match = /^L(\d+)/.exec(fixture.label);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;

export const createFixture = (type: FixtureType, index: number, stage?: { width: number; depth: number; default_z: number }): Fixture => {
  const width = stage?.width ?? 10;
  const depth = stage?.depth ?? 10;
  const base = {
    id: generateId('fixture'),
    label: `L${index}`,
    channel: 0,
    type,
    position: { x: width / 2, y: 1, z: stage?.default_z ?? 5.74 },
    target: { x: width / 2, y: depth / 2 },
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

/** 렌즈 고르기: 고정 렌즈('19deg' 등) 또는 줌('zoom-narrow' / 'zoom-medium'). 필요하면 기종을 바꾼다 */
export type LensChoice = LensType | 'zoom-narrow' | 'zoom-medium';

const replaceType = (fixtures: Fixture[], fix: Fixture, type: FixtureType): Fixture => {
  const replacement = createFixture(type, 1);
  replacement.id = fix.id;
  replacement.label = fix.label;
  replacement.channel = fix.channel;
  replacement.position = fix.position;
  replacement.target = fix.target;
  replacement.is_visible = fix.is_visible;
  replacement.gel = fix.gel;
  replacement.level = fix.level;
  replacement.cast_shadow = fix.cast_shadow;
  if ('shutter_polygon' in fix && 'shutter_polygon' in replacement) {
    replacement.shutter_polygon = fix.shutter_polygon;
    replacement.shutter_active = fix.shutter_active;
  }
  fixtures[fixtures.indexOf(fix)] = replacement;
  return replacement;
};

/** 선택한 조명의 속성을 바꾼다. 실행 취소 기록을 남긴다 */
export const updateFixtureProp = (fixtureId: string, prop: string, value: unknown, subProp?: 'x' | 'y' | 'z') => {
  commitHistory();
  setState(state => {
    const cue = state.cues[state.active_cue_index];
    const fix = cue?.fixtures.find(f => f.id === fixtureId);
    if (!cue || !fix) return;
    const num = typeof value === 'number' ? value : parseFloat(String(value));

    switch (prop) {
      case 'label': {
        const label = String(value).trim();
        if (label) fix.label = label;
        return;
      }
      case 'channel': {
        const channel = Math.round(num);
        fix.channel = Number.isFinite(channel) ? Math.min(91, Math.max(0, channel)) : undefined;
        return;
      }
      case 'position':
        if (subProp && Number.isFinite(num)) fix.position[subProp] = num;
        return;
      case 'target':
        if ((subProp === 'x' || subProp === 'y') && Number.isFinite(num)) fix.target[subProp] = num;
        return;
      case 'lens': {
        const choice = value as LensChoice;
        if (choice === 'zoom-narrow' || choice === 'zoom-medium') {
          const zoom = fix.type === 'zoom' ? fix : replaceType(cue.fixtures, fix, 'zoom');
          if (zoom.type !== 'zoom') return;
          zoom.zoom_range = choice === 'zoom-narrow' ? 'narrow' : 'medium';
          const range = ZoomAngleRanges[zoom.zoom_range];
          zoom.zoom_angle = Math.min(range.max, Math.max(range.min, zoom.zoom_angle));
        } else {
          const ellip = fix.type === 'ellipsoidal' ? fix : replaceType(cue.fixtures, fix, 'ellipsoidal');
          if (ellip.type === 'ellipsoidal') ellip.lens_type = choice;
        }
        return;
      }
      case 'zoom_angle':
        if (fix.type === 'zoom' && Number.isFinite(num)) {
          const range = ZoomAngleRanges[fix.zoom_range as ZoomRangeType];
          fix.zoom_angle = Math.min(range.max, Math.max(range.min, num));
        }
        return;
      case 'focus_level':
        if (fix.type === 'fresnel' && Number.isFinite(num)) {
          fix.focus_level = Math.min(1, Math.max(0, num));
          fix.focus = focusLabel(fix.focus_level);
        }
        return;
      case 'lamp_type':
        if (fix.type === 'par') fix.lamp_type = value as ParLampType;
        return;
      case 'rotation_angle':
        if (fix.type === 'par' && Number.isFinite(num)) fix.rotation_angle = ((num % 180) + 180) % 180;
        return;
      case 'gel':
        fix.gel = getGel(String(value ?? '')) ? String(value) : null;
        return;
      case 'level':
        fix.level = Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 100;
        return;
      case 'shutter_active':
        if (GeometryEngine.fixtureHasShutters(fix)) fix.shutter_active = Boolean(value);
        return;
      case 'cast_shadow':
        fix.cast_shadow = Boolean(value);
        return;
    }
  });
};

export const toggleFixtureVisible = (fixtureId: string) => {
  commitHistory();
  setState(state => {
    const fix = state.cues[state.active_cue_index]?.fixtures.find(f => f.id === fixtureId);
    if (fix) fix.is_visible = fix.is_visible === false;
  });
};

export const deleteFixture = (fixtureId: string) => {
  commitHistory();
  setState(state => {
    const cue = state.cues[state.active_cue_index];
    if (!cue) return;
    cue.fixtures = cue.fixtures.filter(f => f.id !== fixtureId);
    if (state.selected_fixture_id === fixtureId) {
      state.selected_fixture_id = null;
      state.selected_fixture_ids = [];
    }
  });
};

// 개발 중 시험 스크립트용: 기본 엘립소이달을 무대 가운데에 하나 추가한다
(window as any).addFixture = (type: FixtureType = 'ellipsoidal') => {
  commitHistory();
  setState(state => {
    const cue = state.cues[state.active_cue_index];
    if (!cue) return;
    const fixture = createFixture(type, nextFixtureNumber(cue.fixtures), state.stage_config);
    cue.fixtures.push(fixture);
    state.selected_fixture_id = fixture.id;
    state.selected_fixture_ids = [fixture.id];
    state.selected_set_id = null;
  });
};
