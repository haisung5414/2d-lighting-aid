// src/engine/photometrics.ts
// 조명기 광도 모델. Probe, 2D, 3D가 모두 이 모델을 쓴다.
// 기준 자료: ETC Source Four 19/26/36/50 deg, Source Four Fresnel 사양서 (HPL 750/115 측정값)
// 좌표: 앱 좌표 (x: 오른쪽, y: 객석 방향, z: 높이), 단위 m

import type { Fixture, LampKey, LensType, Position2D, Position3D, SetPiece } from '../types';
import { lightColorOf } from './gels';

export type Vec3 = Position3D;

interface DatasheetPoint {
  /** 빔 각도(중심 밝기의 50%), 전체 각도 deg */
  beam: number;
  /** 필드 각도(중심 밝기의 10%), 전체 각도 deg */
  field: number;
  /** HPL 750/115 기준 중심 광도 cd */
  candela: number;
}

export const LAMP_OPTIONS: Record<LampKey, { label: string }> = {
  HPL575_230: { label: 'HPL 575W / 230V' },
  HPL750_230: { label: 'HPL 750W / 230V' }
};

/** 극장 확인 결과: HPL 750W */
export const DEFAULT_LAMP: LampKey = 'HPL750_230';

/** 사양서의 렌즈별 측정값과 램프 보정 계수(Cd MF) */
const SOURCE_FOUR: Record<LensType, DatasheetPoint & { cdMF: Record<LampKey, number> }> = {
  '19deg': { beam: 15, field: 18, candela: 243520, cdMF: { HPL750_230: 0.64, HPL575_230: 0.55 } },
  '26deg': { beam: 18, field: 25, candela: 176255, cdMF: { HPL750_230: 0.64, HPL575_230: 0.53 } },
  '36deg': { beam: 27, field: 34, candela: 90885, cdMF: { HPL750_230: 0.74, HPL575_230: 0.63 } },
  // 저장 파일 호환을 위해 키는 '51deg'로 유지한다. 실제 기종은 Source Four 50도다.
  '51deg': { beam: 36, field: 50, candela: 45650, cdMF: { HPL750_230: 0.74, HPL575_230: 0.61 } }
};

export const LENS_LABELS: Record<LensType, string> = {
  '19deg': '19°',
  '26deg': '26°',
  '36deg': '36°',
  '51deg': '50°'
};

const FRESNEL: Record<'narrow' | 'medium' | 'flood', DatasheetPoint> = {
  narrow: { beam: 9, field: 20, candela: 124300 },
  medium: { beam: 21, field: 40, candela: 51500 },
  flood: { beam: 52, field: 65, candela: 17600 }
};

/** 프레넬은 Spot/Flood 두 계수만 제공된다. Medium은 두 값의 평균을 쓴다. */
const FRESNEL_CD_MF: Record<LampKey, { spot: number; flood: number }> = {
  HPL750_230: { spot: 0.82, flood: 0.86 },
  HPL575_230: { spot: 0.69, flood: 0.63 }
};

/**
 * PAR: 극장 세부 도면(장비 상세도)에 따르면 PAR64 1kW/230V.
 * 빔 각도와 중심 광도는 Osram PAR64 1000W 240V 램프 값(CP60/61/62)을 쓴다. 반각 deg, X축이 긴 축.
 * - 필드 각도는 제조사가 공개하지 않아 빔 각도의 1.5배로 추정한다.
 * - WFL(CP95)은 공개 자료가 부족해 빔 70x45도, MFL과 같은 광속 수준으로 추정한다.
 */
const PAR_FIELD_FACTOR = 1.5;
const parLamp = (beamFullX: number, beamFullY: number, candela: number, estimated: boolean) => ({
  beamX: beamFullX / 2,
  beamY: beamFullY / 2,
  fieldX: beamFullX / 2 * PAR_FIELD_FACTOR,
  fieldY: beamFullY / 2 * PAR_FIELD_FACTOR,
  candela,
  estimated
});

export const PAR_LAMPS = {
  VNSP: parLamp(11, 10, 307500, false),
  NSP: parLamp(12, 10, 255400, false),
  MFL: parLamp(25, 12, 116000, false),
  WFL: parLamp(70, 45, 116000 * (25 * 12) / (70 * 45), true)
};

export interface Photometry {
  /** 램프 보정까지 적용한 중심 광도 cd */
  candela: number;
  /** 반각 deg. A축은 pan 방향(바닥에서 길게 늘어나는 축), B축은 그와 수직인 축 */
  beamA: number;
  beamB: number;
  fieldA: number;
  fieldB: number;
  /** 배광 곡선 지수. f(r) = 10^(-r^p), r = 필드 반각으로 정규화한 각도 */
  exponent: number;
  /** 사양서 값이 아니라 추정한 값인지 */
  estimated: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const logLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const toRad = (deg: number) => deg * Math.PI / 180;

/**
 * 빔 각도에서 50%, 필드 각도에서 10%가 되도록 지수를 구한다.
 * 10^(-k^p) = 0.5  ->  p = ln(log10 2) / ln k   (k = 빔/필드)
 */
const exponentFor = (beamToField: number): number => {
  const k = Math.min(0.95, Math.max(0.2, beamToField));
  return Math.log(Math.log10(2)) / Math.log(k);
};

/** 고정 렌즈 데이터를 필드 각도 기준으로 보간한다 (줌 조명 추정용) */
const interpolateSourceFour = (fieldFull: number, lamp: LampKey): { beam: number; candela: number } => {
  const points = (Object.values(SOURCE_FOUR))
    .map(p => ({ field: p.field, ratio: p.beam / p.field, candela: p.candela * p.cdMF[lamp] }))
    .sort((a, b) => a.field - b.field);

  let lo = points[0];
  let hi = points[points.length - 1];
  for (let i = 0; i < points.length - 1; i++) {
    if (fieldFull >= points[i].field && fieldFull <= points[i + 1].field) {
      lo = points[i];
      hi = points[i + 1];
      break;
    }
  }
  if (fieldFull < points[0].field) hi = points[1];
  if (fieldFull > points[points.length - 1].field) lo = points[points.length - 2];

  const t = (fieldFull - lo.field) / (hi.field - lo.field);
  return {
    beam: fieldFull * lerp(lo.ratio, hi.ratio, t),
    candela: logLerp(lo.candela, hi.candela, t)
  };
};

export const getPhotometry = (fix: Fixture, lamp: LampKey = DEFAULT_LAMP): Photometry => {
  if (fix.type === 'ellipsoidal') {
    const d = SOURCE_FOUR[fix.lens_type];
    const half = { beam: d.beam / 2, field: d.field / 2 };
    return {
      candela: d.candela * d.cdMF[lamp],
      beamA: half.beam, beamB: half.beam, fieldA: half.field, fieldB: half.field,
      exponent: exponentFor(d.beam / d.field),
      estimated: false
    };
  }

  if (fix.type === 'zoom') {
    const field = fix.zoom_angle;
    const { beam, candela } = interpolateSourceFour(field, lamp);
    return {
      candela,
      beamA: beam / 2, beamB: beam / 2, fieldA: field / 2, fieldB: field / 2,
      exponent: exponentFor(beam / field),
      estimated: true
    };
  }

  if (fix.type === 'fresnel') {
    const level = Math.min(1, Math.max(0, fix.focus_level));
    const [from, to, t] = level <= 0.5
      ? [FRESNEL.narrow, FRESNEL.medium, level * 2]
      : [FRESNEL.medium, FRESNEL.flood, (level - 0.5) * 2];
    const mf = FRESNEL_CD_MF[lamp];
    const mfAt = lerp(mf.spot, mf.flood, level);
    const beam = lerp(from.beam, to.beam, t);
    const field = lerp(from.field, to.field, t);
    return {
      candela: logLerp(from.candela, to.candela, t) * mfAt,
      beamA: beam / 2, beamB: beam / 2, fieldA: field / 2, fieldB: field / 2,
      exponent: exponentFor(beam / field),
      estimated: false
    };
  }

  // PAR64 1kW: 자체 램프를 쓰므로 HPL 램프 보정 계수는 적용하지 않는다
  const par = PAR_LAMPS[fix.lamp_type];
  return {
    candela: par.candela,
    beamA: par.beamX, beamB: par.beamY, fieldA: par.fieldX, fieldB: par.fieldY,
    exponent: exponentFor(1 / PAR_FIELD_FACTOR),
    estimated: par.estimated
  };
};

/* ---------- 방향 계산 ---------- */

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-9, len(a)));
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

export interface BeamFrame {
  origin: Vec3;
  /** 빔 중심 방향 */
  dir: Vec3;
  /** pan 방향 축 (PAR는 rotation_angle만큼 회전) */
  axisA: Vec3;
  /** 수평 축 */
  axisB: Vec3;
}

export const getBeamFrame = (fix: Fixture): BeamFrame => {
  const origin = { ...fix.position };
  const dir = norm(sub({ x: fix.target.x, y: fix.target.y, z: 0 }, origin));
  let axisB = cross(dir, { x: 0, y: 0, z: 1 });
  if (len(axisB) < 1e-4) axisB = { x: 1, y: 0, z: 0 };
  axisB = norm(axisB);
  let axisA = norm(cross(axisB, dir));

  if (fix.type === 'par') {
    const r = toRad(fix.rotation_angle);
    const a2 = { x: axisA.x * Math.cos(r) + axisB.x * Math.sin(r), y: axisA.y * Math.cos(r) + axisB.y * Math.sin(r), z: axisA.z * Math.cos(r) + axisB.z * Math.sin(r) };
    const b2 = { x: -axisA.x * Math.sin(r) + axisB.x * Math.cos(r), y: -axisA.y * Math.sin(r) + axisB.y * Math.cos(r), z: -axisA.z * Math.sin(r) + axisB.z * Math.cos(r) };
    axisA = a2;
    axisB = b2;
  }

  return { origin, dir, axisA, axisB };
};

/** 빔 중심에서 벗어난 정도에 따른 상대 광도 (0~1) */
export const relativeIntensity = (phot: Photometry, frame: BeamFrame, towardPoint: Vec3): number => {
  const z = dot(towardPoint, frame.dir);
  if (z <= 0) return 0;
  const ta = Math.atan2(dot(towardPoint, frame.axisA), z) / toRad(phot.fieldA);
  const tb = Math.atan2(dot(towardPoint, frame.axisB), z) / toRad(phot.fieldB);
  const r = Math.hypot(ta, tb);
  return Math.pow(10, -Math.pow(r, phot.exponent));
};

/* ---------- 셔터 ---------- */

export const shutterPolygon = (fix: Fixture): Position2D[] | null => {
  if ((fix.type !== 'ellipsoidal' && fix.type !== 'zoom') || !fix.shutter_active) return null;
  return fix.shutter_polygon.map(p => ({ x: fix.target.x + p.dx, y: fix.target.y + p.dy }));
};

const pointInPolygon = (point: Position2D, polygon: Position2D[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};

/** 셔터는 바닥(z=0) 위의 사각형으로 정의되어 있으므로, 점을 조명에서 바닥으로 투영해서 판정한다 */
export const passesShutter = (fix: Fixture, point: Vec3): boolean => {
  const polygon = shutterPolygon(fix);
  if (!polygon) return true;
  const f = fix.position;
  if (point.z >= f.z - 0.001) return true;
  const t = f.z / (f.z - point.z);
  return pointInPolygon({ x: f.x + (point.x - f.x) * t, y: f.y + (point.y - f.y) * t }, polygon);
};

/** 3D에서 그림자를 계산할 수 있는 조명 수 상한 */
export const MAX_SHADOW_FIXTURES = 4;

/* ---------- 디머 ---------- */

/** 디머 값 0~100 % (없으면 100) */
export const dimmerLevel = (fix: Fixture): number =>
  Math.min(100, Math.max(0, Number.isFinite(fix.level) ? fix.level! : 100));

/**
 * 디머 값에 따른 실제 광량 비율.
 * 텅스텐 디머는 보통 제곱 법칙 곡선을 쓰므로 광량 = 디머 값^2 로 본다. 예: 50% -> 25%
 */
export const dimmerOutput = (fix: Fixture): number => Math.pow(dimmerLevel(fix) / 100, 2);

/* ---------- 세트에 가려짐 ---------- */

/** 조명에서 점까지의 선분이 세트 상자를 지나는지 (상자 좌표계에서 slab 판정) */
export const blockedBySetPieces = (from: Vec3, to: Vec3, pieces: SetPiece[]): boolean => pieces.some(piece => {
  const r = -piece.rotation * Math.PI / 180;
  const local = (p: Vec3): Vec3 => {
    const dx = p.x - piece.x;
    const dy = p.y - piece.y;
    return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r), z: p.z };
  };
  const a = local(from);
  const b = local(to);
  const min = [-piece.width / 2, -piece.depth / 2, 0];
  const max = [piece.width / 2, piece.depth / 2, piece.height];
  const start = [a.x, a.y, a.z];
  const delta = [b.x - a.x, b.y - a.y, b.z - a.z];
  let t0 = 0;
  // 끝점(측정 지점)이 상자 표면에 닿아 있는 경우는 가려진 것으로 보지 않는다
  let t1 = 0.999;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(delta[k]) < 1e-9) {
      if (start[k] < min[k] || start[k] > max[k]) return false;
      continue;
    }
    let ta = (min[k] - start[k]) / delta[k];
    let tb = (max[k] - start[k]) / delta[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
});

/* ---------- 조도 ---------- */

export interface IlluminanceResult {
  /** 법선 방향 면의 조도 lux (젤 투과율 반영) */
  lux: number;
  /** 빛의 색. 선형 sRGB, 휘도 1 기준 */
  rgb: [number, number, number];
  /** 이 지점을 향하는 광도 cd */
  intensity: number;
  distance: number;
  /** 빔 중심에서 벗어난 각도 deg */
  offAxis: number;
  blockedByShutter: boolean;
  /** 세트 상자에 가려짐 */
  blockedBySet: boolean;
}

/**
 * 조도 E = I(각도) * cos(입사각) / 거리^2
 * normal을 생략하면 빛을 정면으로 받는 면(법선 조도)으로 계산한다.
 */
export const illuminanceAt = (fix: Fixture, point: Vec3, normal: Vec3 | null, lamp: LampKey = DEFAULT_LAMP, setPieces: SetPiece[] = []): IlluminanceResult => {
  const phot = getPhotometry(fix, lamp);
  const frame = getBeamFrame(fix);
  const toPoint = sub(point, frame.origin);
  const distance = Math.max(0.1, len(toPoint));
  const dirToPoint = scale(toPoint, 1 / distance);
  const offAxis = Math.acos(Math.min(1, Math.max(-1, dot(dirToPoint, frame.dir)))) * 180 / Math.PI;

  const color = lightColorOf(fix.gel);
  if (!passesShutter(fix, point)) {
    return { lux: 0, rgb: color.rgb, intensity: 0, distance, offAxis, blockedByShutter: true, blockedBySet: false };
  }
  if (blockedBySetPieces(frame.origin, point, setPieces)) {
    return { lux: 0, rgb: color.rgb, intensity: 0, distance, offAxis, blockedByShutter: false, blockedBySet: true };
  }

  const intensity = phot.candela * dimmerOutput(fix) * color.transmission * relativeIntensity(phot, frame, dirToPoint);
  const cosIncidence = normal ? Math.max(0, -dot(normal, dirToPoint)) : 1;
  return {
    lux: intensity * cosIncidence / (distance * distance),
    rgb: color.rgb,
    intensity,
    distance,
    offAxis,
    blockedByShutter: false,
    blockedBySet: false
  };
};

/** 객석 방향(+y)을 바라보는 얼굴 면의 법선 */
export const FACE_NORMAL: Vec3 = { x: 0, y: 1, z: 0 };
export const HORIZONTAL_NORMAL: Vec3 = { x: 0, y: 0, z: 1 };
