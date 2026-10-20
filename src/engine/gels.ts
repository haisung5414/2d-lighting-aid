// src/engine/gels.ts
// 젤(컬러 필터) 색 계산.
// LEE가 공개하는 텅스텐 3200K 기준 색도(x, y)와 투과율(Y)을 그대로 쓴다.
// 이 값은 "텅스텐 빛이 젤을 통과한 결과"이므로 광원 색과 젤 색을 따로 곱할 필요가 없다.
//
// 표시 방식: Full CTB(L201)를 통과한 빛을 흰색으로 맞춘다 (그 색도 -> D65 Bradford 색순응).
// 그래서 젤 없는 텅스텐은 실제처럼 노랗게, Full CTB는 흰색, Double CTB는 푸르게 보인다.
// (예전에는 텅스텐 자체를 흰색으로 맞춰서, CTB를 넣으면 흰색이 아니라 푸른색으로 보였다)
// 조명끼리의 합성은 선형 RGB에서 더한다(XYZ에서 더하는 것과 같다).

export interface GelSpec {
  /** LEE 번호 */
  code: string;
  name: string;
  category: string;
  /** 텅스텐 3200K 기준 색도 */
  x: number;
  y: number;
  /** 텅스텐 3200K 기준 투과율 % */
  transmission: number;
}

/**
 * 극장 보유 LEE 필터 (텅스텐 3200K 기준 값)
 * 출처: leefilters.com/colour/<번호>-<이름>/ 의 Tungsten 표. 8종은 소매점(goknight.com) 표와도 일치한다.
 */
export const GELS: GelSpec[] = [
  { code: '147', name: 'Apricot', category: 'Warm Tint', x: 0.534, y: 0.404, transmission: 58.3 },
  { code: '192', name: 'Flesh Pink', category: 'Warm Tint', x: 0.527, y: 0.331, transmission: 41.4 },
  { code: '142', name: 'Pale Violet', category: 'Cool Tint', x: 0.306, y: 0.262, transmission: 19.4 },
  { code: '205', name: '1/2 CTO', category: 'Color Correction', x: 0.474, y: 0.417, transmission: 74.5 },
  { code: '202', name: '1/2 CTB', category: 'Color Correction', x: 0.372, y: 0.374, transmission: 53.2 },
  { code: '201', name: 'Full CTB', category: 'Color Correction', x: 0.330, y: 0.339, transmission: 35.0 },
  { code: '200', name: 'Double CTB', category: 'Color Correction', x: 0.250, y: 0.256, transmission: 14.9 },
  { code: '101', name: 'Yellow', category: 'Color', x: 0.508, y: 0.473, transmission: 80.7 },
  { code: '158', name: 'Deep Orange', category: 'Color', x: 0.612, y: 0.387, transmission: 40.6 },
  { code: '165', name: 'Daylight Blue', category: 'Color', x: 0.211, y: 0.273, transmission: 17.3 },
  { code: '119', name: 'Dark Blue', category: 'Deep', x: 0.137, y: 0.109, transmission: 2.3 }
];

const GEL_BY_CODE = (): Map<string, GelSpec> => new Map(GELS.map(gel => [gel.code, gel]));

export const getGel = (code: string | null | undefined): GelSpec | null =>
  code ? GEL_BY_CODE().get(code) ?? null : null;

/* ---------- 색 변환 ---------- */

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
];

const BRADFORD: Mat3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296]
];

const BRADFORD_INV: Mat3 = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867]
];

const XYZ_TO_LINEAR_SRGB: Mat3 = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.9692660, 1.8760108, 0.0415560],
  [0.0556434, -0.2040259, 1.0572252]
];

const xyToXYZ = (x: number, y: number): Vec3 => [x / y, 1, (1 - x - y) / y];

/** 3200K 흑체 색도 (LEE 텅스텐 측정 기준 광원) */
export const TUNGSTEN_WHITE = { x: 0.4234, y: 0.3990 };
/** 화면에서 흰색으로 보이는 빛: 텅스텐 + Full CTB(L201). 텅스텐을 주광 쪽으로 바꾸는 표준 보정 */
export const DISPLAY_WHITE = { x: 0.330, y: 0.339 };
const D65: Vec3 = [0.95047, 1, 1.08883];

const SOURCE_CONE = mul(BRADFORD, xyToXYZ(DISPLAY_WHITE.x, DISPLAY_WHITE.y));
const D65_CONE = mul(BRADFORD, D65);

const adaptToD65 = (xyz: Vec3): Vec3 => {
  const cone = mul(BRADFORD, xyz);
  return mul(BRADFORD_INV, [
    cone[0] * D65_CONE[0] / SOURCE_CONE[0],
    cone[1] * D65_CONE[1] / SOURCE_CONE[1],
    cone[2] * D65_CONE[2] / SOURCE_CONE[2]
  ]);
};

export interface LightColor {
  /** 선형 sRGB. 휘도(Y)가 1이 되도록 맞춘 값 (화면 범위를 벗어난 성분은 0으로 자른다) */
  rgb: Vec3;
  /** 투과율 0~1. 젤이 없으면 1 */
  transmission: number;
}

const colorFromXY = (x: number, y: number): Vec3 => {
  const linear = mul(XYZ_TO_LINEAR_SRGB, adaptToD65(xyToXYZ(x, y)));
  return linear.map(v => Math.max(0, v)) as Vec3;
};

/** 젤 없는 텅스텐 빛: 흰색 기준(Full CTB)보다 노랗다 */
const OPEN_TUNGSTEN: LightColor = { rgb: colorFromXY(TUNGSTEN_WHITE.x, TUNGSTEN_WHITE.y), transmission: 1 };

/** 조명 하나가 내는 빛의 색과 투과율 */
export const lightColorOf = (gelCode: string | null | undefined): LightColor => {
  const gel = getGel(gelCode);
  if (!gel) return OPEN_TUNGSTEN;
  return { rgb: colorFromXY(gel.x, gel.y), transmission: gel.transmission / 100 };
};

/** 선형 RGB -> 화면 표시용 CSS 색. 가장 큰 성분을 1로 맞춰 밝기와 상관없이 색만 보여 준다 */
export const toDisplayHex = (rgb: Vec3): string => {
  const peak = Math.max(1e-6, ...rgb);
  const encode = (v: number) => {
    const c = Math.min(1, Math.max(0, v / peak));
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(s * 255).toString(16).padStart(2, '0');
  };
  return `#${encode(rgb[0])}${encode(rgb[1])}${encode(rgb[2])}`;
};

export const gelDisplayHex = (gelCode: string | null | undefined): string =>
  toDisplayHex(lightColorOf(gelCode).rgb);
