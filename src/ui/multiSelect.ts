// src/ui/multiSelect.ts
// 다중 선택 도구 (2D 평면 전용): 끌어서 여러 객체를 고르고, 한꺼번에 옮기거나 지운다.
// - 왼쪽→오른쪽으로 끌면 사각형 안에 다 들어온 것만, 오른쪽→왼쪽으로 끌면 사각형에 걸친 것까지 고른다 (SketchUp과 같다).
// - Ctrl(Mac은 Cmd)을 누른 채 누르면 하나씩 넣고 빼고, 누른 채 끌면 지금 선택에 더한다.
// - 조명을 옮기면 조준점도 같이 옮긴다 (조명 배치를 통째로 옮기는 일이 더 흔하다).
// - 조명은 지금 씬의 것만 고른다. 세트와 사람 모형은 모든 씬이 함께 쓰므로 모든 씬에서 같이 움직이고 지워진다.
// 선택은 화면용이라 저장 파일과 실행 취소 기록에 들어가지 않는다. 숨긴 것은 고르지 않는다.

import { commitHistory, getCurrentCue, getState, setState, subscribe } from '../state/store';
import { isActorShown, visibleSetPieces } from '../state/sceneVisibility';
import { pointInSetPiece, setPieceCorners } from '../render/setShape';
import { clearSelection, getSelectionKind } from './selection';
import { resetVcb } from './statusbar';
import type { Position2D } from '../types';

export type MultiKind = 'fixture' | 'set' | 'actor';
interface Hit { kind: MultiKind; id: string; }

const picked = { fixture: new Set<string>(), set: new Set<string>(), actor: new Set<string>() };
/** 고르는 사각형 (평면 좌표). additive면 지금 선택에 더한다 */
let box: { start: Position2D; end: Position2D; additive: boolean } | null = null;
/** 묶음 끌기: 시작점과 처음 위치 (끌기마다 처음 위치 + 총 이동량으로 놓아 오차가 쌓이지 않게 한다) */
let drag: {
  start: Position2D;
  moved: boolean;
  fixtures: Map<string, { px: number; py: number; tx: number; ty: number }>;
  sets: Map<string, Position2D>;
  actors: Map<string, Position2D>;
} | null = null;

const listeners = new Set<() => void>();
const changed = () => { renderHint(); listeners.forEach(listener => listener()); };
/** 선택이나 사각형이 바뀔 때 (canvas가 다시 그린다) */
export const onMultiChange = (listener: () => void) => { listeners.add(listener); };

/* ---------- 조회 ---------- */

export const getMultiSelection = () => picked;
export const getSelectBox = () => box;
export const multiCount = () => picked.fixture.size + picked.set.size + picked.actor.size;
export const isMultiDragging = () => Boolean(drag?.moved);

/** 이 자리에 보이는 객체 (위에 그려진 것부터: 조명 → 사람 모형 → 세트, 선택 도구와 같은 순서) */
const hitAt = (world: Position2D): Hit | null => {
  const state = getState();
  const cue = getCurrentCue();
  if (!cue) return null;
  for (let j = cue.fixtures.length - 1; j >= 0; j--) {
    const fix = cue.fixtures[j];
    if (fix.is_visible !== false && Math.hypot(world.x - fix.position.x, world.y - fix.position.y) < 0.6) return { kind: 'fixture', id: fix.id };
  }
  for (let a = state.actors.length - 1; a >= 0; a--) {
    const actor = state.actors[a];
    if (isActorShown(cue, actor) && Math.hypot(world.x - actor.x, world.y - actor.y) < 0.6) return { kind: 'actor', id: actor.id };
  }
  const pieces = visibleSetPieces(cue, state.stage_config);
  for (let k = pieces.length - 1; k >= 0; k--) {
    if (pointInSetPiece(world, pieces[k])) return { kind: 'set', id: pieces[k].id };
  }
  return null;
};

/** 커서 모양: 고른 객체 위에서는 옮기기 커서 */
export const multiCursorAt = (world: Position2D): string => {
  const hit = hitAt(world);
  return hit && picked[hit.kind].has(hit.id) ? 'move' : '';
};

/* ---------- 사각형 고르기 ---------- */

type Rect = { x0: number; y0: number; x1: number; y1: number };
const inRect = (p: Position2D, r: Rect) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

const segmentsCross = (a: Position2D, b: Position2D, c: Position2D, d: Position2D) => {
  const cross = (o: Position2D, p: Position2D, q: Position2D) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};

/** 왼쪽→오른쪽(window): 다 들어온 것만. 오른쪽→왼쪽(crossing): 걸친 것까지 */
export const isCrossingBox = (b: { start: Position2D; end: Position2D }) => b.end.x < b.start.x;

const hitsInBox = (b: { start: Position2D; end: Position2D }): Hit[] => {
  const r: Rect = { x0: Math.min(b.start.x, b.end.x), y0: Math.min(b.start.y, b.end.y), x1: Math.max(b.start.x, b.end.x), y1: Math.max(b.start.y, b.end.y) };
  const crossing = isCrossingBox(b);
  const state = getState();
  const cue = getCurrentCue();
  if (!cue) return [];
  const hits: Hit[] = [];
  // 조명과 사람 모형은 점(조명 몸체, 사람 위치)으로 본다
  cue.fixtures.forEach(fix => { if (fix.is_visible !== false && inRect(fix.position, r)) hits.push({ kind: 'fixture', id: fix.id }); });
  state.actors.forEach(actor => { if (isActorShown(cue, actor) && inRect(actor, r)) hits.push({ kind: 'actor', id: actor.id }); });
  const rc: Position2D[] = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
  visibleSetPieces(cue, state.stage_config).forEach(piece => {
    const pc = setPieceCorners(piece);
    const inside = crossing
      ? pc.some(p => inRect(p, r)) || rc.some(p => pointInSetPiece(p, piece))
        || pc.some((p, i) => rc.some((q, j) => segmentsCross(p, pc[(i + 1) % 4], q, rc[(j + 1) % 4])))
      : pc.every(p => inRect(p, r));
    if (inside) hits.push({ kind: 'set', id: piece.id });
  });
  return hits;
};

/* ---------- 선택 바꾸기 ---------- */

export const clearMulti = () => {
  if (!multiCount() && !box) return;
  picked.fixture.clear(); picked.set.clear(); picked.actor.clear();
  box = null;
  drag = null;
  changed();
};

/** 다중 선택 도구를 켤 때: 선택 도구에서 하나 골라 둔 것이 있으면 그것부터 담는다 */
export const startMulti = (extra?: Hit) => {
  const state = getState();
  const kind = getSelectionKind();
  if (kind === 'fixture' && state.selected_fixture_id) picked.fixture.add(state.selected_fixture_id);
  if (kind === 'set' && state.selected_set_id) picked.set.add(state.selected_set_id);
  if (kind === 'actor' && state.selected_actor_id) picked.actor.add(state.selected_actor_id);
  if (extra) picked[extra.kind].add(extra.id);
  // 단일 선택의 손잡이·패널은 숨긴다 (묶음에는 크기·회전 손잡이가 없다)
  clearSelection();
  changed();
};

/** 선택 도구에서 Ctrl+누르기: 누른 객체 (없으면 null) */
export const hitForCtrlClick = (world: Position2D): Hit | null => hitAt(world);

/* ---------- 캔버스 입력 ---------- */

export const multiPointerDown = (world: Position2D, ctrl: boolean) => {
  const hit = hitAt(world);
  if (hit && ctrl) {
    const set = picked[hit.kind];
    if (set.has(hit.id)) set.delete(hit.id); else set.add(hit.id);
    changed();
    return;
  }
  if (hit) {
    if (!picked[hit.kind].has(hit.id)) {
      picked.fixture.clear(); picked.set.clear(); picked.actor.clear();
      picked[hit.kind].add(hit.id);
      changed();
    }
    startDrag(world);
    return;
  }
  box = { start: world, end: world, additive: ctrl };
  changed();
};

export const multiPointerMove = (world: Position2D): boolean => {
  if (box) {
    box.end = world;
    changed();
    return true;
  }
  if (drag) {
    moveTo(world);
    return true;
  }
  return false;
};

export const multiPointerUp = (world: Position2D): boolean => {
  if (box) {
    box.end = world;
    const b = box;
    box = null;
    // 끌지 않고 빈 곳을 누르기만 하면 선택을 비운다 (Ctrl이면 그대로)
    const clicked = Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y) < 0.05;
    if (!b.additive) { picked.fixture.clear(); picked.set.clear(); picked.actor.clear(); }
    if (!clicked) hitsInBox(b).forEach(hit => picked[hit.kind].add(hit.id));
    changed();
    return true;
  }
  if (drag) {
    drag = null;
    changed();
    return true;
  }
  return false;
};

/* ---------- 묶음 옮기기 ---------- */

const startDrag = (world: Position2D) => {
  const state = getState();
  const cue = getCurrentCue();
  resetVcb(); // 묶음 끌기는 수치 칸으로 거리를 정하지 않는다
  drag = { start: world, moved: false, fixtures: new Map(), sets: new Map(), actors: new Map() };
  cue?.fixtures.forEach(f => { if (picked.fixture.has(f.id)) drag!.fixtures.set(f.id, { px: f.position.x, py: f.position.y, tx: f.target.x, ty: f.target.y }); });
  (state.stage_config.set_pieces ?? []).forEach(p => { if (picked.set.has(p.id)) drag!.sets.set(p.id, { x: p.x, y: p.y }); });
  state.actors.forEach(a => { if (picked.actor.has(a.id)) drag!.actors.set(a.id, { x: a.x, y: a.y }); });
};

const round3 = (v: number) => Math.round(v * 1000) / 1000;

const moveTo = (world: Position2D) => {
  if (!drag) return;
  const d = drag;
  const stage = getState().stage_config;
  let dx = Math.round((world.x - d.start.x) * 100) / 100; // 10 mm 단위
  let dy = Math.round((world.y - d.start.y) * 100) / 100;
  // 사람 모형은 무대 밖으로 못 나간다: 한 명이라도 끝에 닿으면 묶음 전체가 멈춘다 (대형이 흐트러지지 않게)
  d.actors.forEach(a => {
    dx = Math.min(stage.width - a.x, Math.max(-a.x, dx));
    dy = Math.min(stage.depth - a.y, Math.max(-a.y, dy));
  });
  if (!d.moved) {
    if (dx === 0 && dy === 0) return;
    commitHistory(); // 실제로 움직였을 때 한 번만 기록한다 (실행 취소 한 번에 묶음 전체가 돌아간다)
    d.moved = true;
  }
  setState(s => {
    s.cues[s.active_cue_index]?.fixtures.forEach(f => {
      const o = d.fixtures.get(f.id);
      if (!o) return;
      f.position.x = round3(o.px + dx); f.position.y = round3(o.py + dy);
      f.target.x = round3(o.tx + dx); f.target.y = round3(o.ty + dy);
    });
    (s.stage_config.set_pieces ?? []).forEach(p => {
      const o = d.sets.get(p.id);
      if (o) { p.x = round3(o.x + dx); p.y = round3(o.y + dy); }
    });
    s.actors.forEach(a => {
      const o = d.actors.get(a.id);
      if (o) { a.x = round3(o.x + dx); a.y = round3(o.y + dy); }
    });
  });
};

/* ---------- 묶음 지우기 (실행 취소 한 번으로 돌아간다) ---------- */

export const deleteMulti = (): boolean => {
  if (!multiCount()) return false;
  const { fixture, set, actor } = picked;
  commitHistory();
  setState(s => {
    const cue = s.cues[s.active_cue_index];
    if (cue) cue.fixtures = cue.fixtures.filter(f => !fixture.has(f.id));
    s.stage_config.set_pieces = (s.stage_config.set_pieces ?? []).filter(p => !set.has(p.id));
    s.actors = s.actors.filter(a => !actor.has(a.id));
    if (s.selected_fixture_id && fixture.has(s.selected_fixture_id)) s.selected_fixture_id = null;
    if (s.selected_set_id && set.has(s.selected_set_id)) s.selected_set_id = null;
    if (s.selected_actor_id && actor.has(s.selected_actor_id)) s.selected_actor_id = null;
  });
  clearMulti();
  return true;
};

/* ---------- 상태 바 안내 ---------- */

let active = false;
/** 다중 선택 도구가 켜져 있는지 (tools.ts가 알려 준다). 꺼지면 선택을 비운다 */
export const setMultiActive = (on: boolean) => {
  active = on;
  if (on) renderHint(); else clearMulti();
};

const renderHint = () => {
  if (!active) return;
  const hint = document.getElementById('tool-hint');
  if (!hint) return;
  const n = multiCount();
  if (!n) { hint.textContent = '다중 선택: 왼쪽→오른쪽으로 끌면 사각형 안에 다 든 것만, 오른쪽→왼쪽으로 끌면 걸친 것까지 고릅니다. Ctrl+누르기로 하나씩 넣고 뺍니다.'; return; }
  const parts = [
    picked.fixture.size ? `조명 ${picked.fixture.size}` : '',
    picked.set.size ? `세트 ${picked.set.size}` : '',
    picked.actor.size ? `사람 모형 ${picked.actor.size}` : ''
  ].filter(Boolean).join(' · ');
  const shared = (picked.set.size || picked.actor.size) && getState().cues.length > 1 ? ' 세트와 사람 모형은 모든 씬에서 함께 옮겨지고 지워집니다.' : '';
  hint.textContent = `${n}개 선택 (${parts}). 고른 것을 끌어 한꺼번에 옮기고, Delete로 지웁니다.${shared}`;
};

/** 실행 취소나 씬 바꾸기로 사라졌거나 숨겨진 것은 선택에서 뺀다 */
subscribe(() => {
  if (!multiCount() || drag) return;
  const state = getState();
  const cue = getCurrentCue();
  const fixtures = new Set((cue?.fixtures ?? []).filter(f => f.is_visible !== false).map(f => f.id));
  const sets = new Set(visibleSetPieces(cue, state.stage_config).map(p => p.id));
  const actors = new Set(state.actors.filter(a => isActorShown(cue, a)).map(a => a.id));
  let removed = false;
  const prune = (target: Set<string>, alive: Set<string>) => target.forEach(id => { if (!alive.has(id)) { target.delete(id); removed = true; } });
  prune(picked.fixture, fixtures);
  prune(picked.set, sets);
  prune(picked.actor, actors);
  if (removed) changed();
});
