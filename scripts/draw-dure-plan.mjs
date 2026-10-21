// scripts/draw-dure-plan.mjs
// 두레문예관 B1 평면도를 측정값으로 다시 그린다 (사진보다 선명한 벡터 도면).
// 실행: node scripts/draw-dure-plan.mjs → public/venues/dure/dure_floor_plan.svg
// 좌표는 앱 좌표(m)이고 값은 src/config/venues.ts의 DURE와 docs/venues/DURE_MODEL.md를 따른다.
// 문, 계단, 뒤 통로의 단처럼 3D에 없는 요소는 평면도 사진에서 잰 값이다 (오차 ±0.3 m 정도).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 16.4;          // 안쪽 폭
const D = 23.1;          // 안쪽 깊이
const WALL = 0.6;        // 벽 두께 (마감 포함)
const VIEW = { x: -1.2, y: -1.2, w: 18.8, h: 25.5 };  // venues.ts의 레이어 위치와 같아야 한다

const SEAT_Y0 = 9.6;
const SEAT_Y1 = 18.0;
const ROWS = 10;
const SEAT_X0 = 1.0;
const SEAT_X1 = 15.4;
/** 객석 통로 두 줄 (x 범위) */
const AISLES = [[5.05, 5.95], [10.45, 11.35]];
const SEAT_W = 0.5;

const BALCONY = { voidX0: 0.8, voidX1: 15.6, voidY0: 1.1, cornerX: 2.3, cornerY: 0.95, backWall: 18.0 };

const INK = '#2b2b2b';
const SOFT = '#8a8a8a';
const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

const f = (v) => Math.round(v * 1000) / 1000;
const parts = [];
const add = (s) => parts.push(s);
const rect = (x, y, w, h, attrs) => add(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ${attrs}/>`);
const line = (x1, y1, x2, y2, attrs) => add(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${attrs}/>`);
const text = (x, y, s, size, color, attrs = '') =>
  add(`<text x="${f(x)}" y="${f(y)}" font-size="${size}" font-family="${FONT}" text-anchor="middle" fill="${color}" ${attrs}>${s}</text>`);

/* 바탕 */
rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h, 'fill="#f4f4f2"');
rect(0, 0, W, D, 'fill="#ffffff"');

/* 벽: 문 자리를 비우고 채운다. 문은 바깥으로 열리는 양여닫이 */
const doors = {
  left: [[7.6, 9.2], [20.6, 22.2]],
  right: [[6.9, 8.5], [20.6, 22.2]]
};
const wallSegments = (openings, length) => {
  const segs = [];
  let at = -WALL;
  [...openings].sort((a, b) => a[0] - b[0]).forEach(([a, b]) => { segs.push([at, a]); at = b; });
  segs.push([at, length + WALL]);
  return segs;
};
rect(-WALL, -WALL, W + WALL * 2, WALL, `fill="${INK}"`);
rect(-WALL, D, W + WALL * 2, WALL, `fill="${INK}"`);
wallSegments(doors.left, D).forEach(([a, b]) => rect(-WALL, a, WALL, b - a, `fill="${INK}"`));
wallSegments(doors.right, D).forEach(([a, b]) => rect(W, a, WALL, b - a, `fill="${INK}"`));

const doorSwing = (xWall, y0, y1, outward) => {
  // 양여닫이: 문짝 두 개가 벽 바깥쪽으로 90도 열린 모습
  const leaf = (y1 - y0) / 2;
  const dir = outward;  // -1 = 왼쪽(바깥), +1 = 오른쪽(바깥)
  [[y0, 1], [y1, -1]].forEach(([hinge, s]) => {
    const tipX = xWall + dir * leaf;
    line(xWall, hinge, tipX, hinge, `stroke="${INK}" stroke-width="0.04"`);
    const sweep = (dir > 0) === (s > 0) ? 1 : 0;
    add(`<path d="M ${f(tipX)} ${f(hinge)} A ${f(leaf)} ${f(leaf)} 0 0 ${sweep} ${f(xWall)} ${f(hinge + s * leaf)}" fill="none" stroke="${SOFT}" stroke-width="0.025"/>`);
  });
};
doors.left.forEach(([a, b]) => doorSwing(-WALL, a, b, -1));
doors.right.forEach(([a, b]) => doorSwing(W + WALL, a, b, 1));

/* 계단 객석 */
const rowDepth = (SEAT_Y1 - SEAT_Y0) / ROWS;
const sections = [];
let sx = SEAT_X0;
AISLES.forEach(([a, b]) => { sections.push([sx, a]); sx = b; });
sections.push([sx, SEAT_X1]);
for (let r = 0; r < ROWS; r++) {
  const y = SEAT_Y0 + rowDepth * r;
  // 단의 앞 끝선
  line(SEAT_X0, y, SEAT_X1, y, `stroke="${INK}" stroke-width="0.035"`);
  sections.forEach(([x0, x1]) => {
    const n = Math.floor((x1 - x0) / SEAT_W);
    const pad = (x1 - x0 - n * SEAT_W) / 2;
    for (let i = 0; i < n; i++) {
      rect(x0 + pad + i * SEAT_W + 0.04, y + rowDepth * 0.45, SEAT_W - 0.08, rowDepth * 0.42,
        `rx="0.06" fill="#e3e3e0" stroke="${SOFT}" stroke-width="0.02"`);
    }
  });
  // 통로 계단: 한 단 안에 디딤 두 개
  AISLES.forEach(([a, b]) => line(a, y + rowDepth / 2, b, y + rowDepth / 2, `stroke="${SOFT}" stroke-width="0.02"`));
}
rect(SEAT_X0, SEAT_Y0, SEAT_X1 - SEAT_X0, SEAT_Y1 - SEAT_Y0, `fill="none" stroke="${INK}" stroke-width="0.05"`);
AISLES.forEach(([a, b]) => {
  line(a, SEAT_Y0, a, SEAT_Y1, `stroke="${INK}" stroke-width="0.03"`);
  line(b, SEAT_Y0, b, SEAT_Y1, `stroke="${INK}" stroke-width="0.03"`);
});

/* 뒤 통로: 객석 뒤의 단과 계단 두 곳 */
rect(1.0, 20.0, 14.4, 0.9, `fill="#d6d6d3" stroke="${INK}" stroke-width="0.04"`);
[[2.6, 5.6], [10.8, 13.8]].forEach(([x0, x1]) => {
  rect(x0, 20.9, x1 - x0, D - 20.9, `fill="#ffffff" stroke="${INK}" stroke-width="0.04"`);
  for (let x = x0 + 0.3; x < x1 - 0.01; x += 0.3) line(x, 20.9, x, D, `stroke="${INK}" stroke-width="0.02"`);
});

/* 나선계단 (무대 쪽 왼쪽 모서리) */
const stair = { x: 0.8, y: 0.8, r: 0.7 };
add(`<circle cx="${stair.x}" cy="${stair.y}" r="${stair.r}" fill="#ffffff" stroke="${INK}" stroke-width="0.04"/>`);
for (let i = 0; i < 12; i++) {
  const t = i * Math.PI / 6;
  line(stair.x, stair.y, stair.x + Math.cos(t) * stair.r, stair.y + Math.sin(t) * stair.r, `stroke="${SOFT}" stroke-width="0.02"`);
}
add(`<circle cx="${stair.x}" cy="${stair.y}" r="0.08" fill="${INK}"/>`);

/* 위층 선 (점선): 발코니 끝선과 영사실 벽 */
const { voidX0, voidX1, voidY0, cornerX, cornerY, backWall } = BALCONY;
const balconyPath = [
  `M ${voidX0} ${backWall}`,
  `L ${voidX0} ${f(voidY0 + cornerY)}`,
  `A ${cornerX} ${cornerY} 0 0 1 ${f(voidX0 + cornerX)} ${voidY0}`,
  `L ${f(voidX1 - cornerX)} ${voidY0}`,
  `A ${cornerX} ${cornerY} 0 0 1 ${voidX1} ${f(voidY0 + cornerY)}`,
  `L ${voidX1} ${backWall}`
].join(' ');
add(`<path d="${balconyPath}" fill="none" stroke="#3d6fb6" stroke-width="0.05" stroke-dasharray="0.3 0.18"/>`);
line(0, backWall, W, backWall, 'stroke="#3d6fb6" stroke-width="0.05" stroke-dasharray="0.3 0.18"');

/* 글자 */
text(W / 2, 7.9, '평무대', 0.6, SOFT);
text(W / 2, SEAT_Y0 - 0.35, '객석 10열 (맨 윗줄 2.7 m)', 0.38, SOFT);
text(W / 2, 19.65, '뒤 통로·출입부 (위층은 영사실)', 0.38, SOFT);
text(W / 2, voidY0 + 0.6, '발코니 끝선 (위층 2.7 m, 폭 약 1.1 m)', 0.34, '#3d6fb6');

/* 바깥 치수 */
const dim = (x1, y1, x2, y2, label, vertical) => {
  line(x1, y1, x2, y2, `stroke="${SOFT}" stroke-width="0.025"`);
  const tick = vertical ? [[-0.15, 0], [0.15, 0]] : [[0, -0.15], [0, 0.15]];
  [[x1, y1], [x2, y2]].forEach(([x, y]) => line(x + tick[0][0], y + tick[0][1], x + tick[1][0], y + tick[1][1], `stroke="${SOFT}" stroke-width="0.025"`));
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  if (vertical) text(mx - 0.15, my, label, 0.36, SOFT, `transform="rotate(-90 ${f(mx - 0.15)} ${f(my)})"`);
  else text(mx, my - 0.12, label, 0.36, SOFT);
};
dim(0, -0.85, W, -0.85, '16.4 m', false);
dim(-0.85, 0, -0.85, D, '23.1 m', true);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 두레문예관 B1 평면도 (측정값으로 다시 그림). scripts/draw-dure-plan.mjs가 만든다. 1 단위 = 1 m -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" width="${Math.round(VIEW.w * 100)}" height="${Math.round(VIEW.h * 100)}">
${parts.join('\n')}
</svg>
`;

const out = fileURLToPath(new URL('../public/venues/dure/dure_floor_plan.svg', import.meta.url));
writeFileSync(out, svg);
console.log(`wrote ${out} (${parts.length} shapes)`);
