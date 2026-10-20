// src/ui/tools.ts
// 왼쪽 도구 레일과 도구 모드. 선택 도구 하나가 고르기·끌기·화면 이동을 모두 맡고,
// 나머지 도구는 무언가를 "만드는" 일만 한다. 놓고 나면 선택 도구로 돌아온다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §3
// 도구 상태는 화면용이라 저장 파일과 실행 취소 기록에 들어가지 않는다.

import { commitHistory, getState, setState } from '../state/store';
import { VENUES } from '../config/venues';
import { createFixture, nextFixtureNumber } from './fixture';
import type { Fixture, LensType, Position2D, SetPiece, SetPieceKind } from '../types';

export type ToolId = 'select' | 'ellip' | 'fresnel' | 'par' | SetPieceKind;

interface ToolDef {
  id: ToolId;
  name: string;
  key: string;
  keyLabel: string;
  icon: string;
  hint: string;
  flyout?: boolean;
}

const TOOLS: (ToolDef | 'sep')[] = [
  { id: 'select', name: '선택', key: ' ', keyLabel: '␣', icon: '<path d="M5 3l14 8-6 2-2 6z"/>',
    hint: '선택: 조명·세트·사람 모형을 눌러 고르고 끌어서 옮기세요. 빈 곳을 끌면 화면이 움직이고, 휠로 확대·축소합니다.' },
  'sep',
  { id: 'ellip', name: '엘립소이달 놓기', key: 'e', keyLabel: 'E', flyout: true, icon: '<path d="M3 9h9l5-3v12l-5-3H3z"/><path d="M17 12h4"/>',
    hint: '엘립소이달 놓기: 옆에서 렌즈를 고른 뒤 무대를 누르면, 가장 가까운 파이프에 조명이 놓입니다.' },
  { id: 'fresnel', name: '프레넬 놓기', key: 'f', keyLabel: 'F', icon: '<rect x="4" y="6" width="11" height="12" rx="2"/><path d="M15 8c3 1 3 7 0 8M7 9v6M10 9v6"/>',
    hint: '프레넬 놓기: 무대를 누르면 가장 가까운 파이프에 프레넬이 놓입니다.' },
  { id: 'par', name: 'PAR 놓기', key: 'p', keyLabel: 'P', icon: '<path d="M4 7h7l6-2v14l-6-2H4z"/><circle cx="7.5" cy="12" r="2"/>',
    hint: 'PAR 놓기: 무대를 누르면 가장 가까운 파이프에 PAR64가 놓입니다.' },
  'sep',
  { id: 'set', name: '세트 그리기', key: 'r', keyLabel: 'R', icon: '<rect x="4" y="6" width="16" height="12" rx="1" stroke-dasharray="3 2"/><path d="M8 12h8M12 8v8"/>',
    hint: '세트 그리기: 무대를 끌어서 사각형을 그리면 세트가 생깁니다. 그냥 누르면 2 × 1 m 세트가 생깁니다.' },
  { id: 'wall', name: '벽 놓기', key: 'w', keyLabel: 'W', icon: '<rect x="8" y="3" width="8" height="18" rx=".5"/><path d="M8 9h8M8 15h8"/>',
    hint: '벽 놓기: 무대를 누르면 가로 1220 · 두께 30 · 높이 2440 mm 벽이 놓입니다.' },
  { id: 'deck', name: '덧마루 놓기', key: 'd', keyLabel: 'D', icon: '<path d="M3 11l9-4 9 4-9 4z"/><path d="M3 11v2l9 4 9-4v-2"/>',
    hint: '덧마루 놓기: 무대를 누르면 1800 × 900 × 150 mm 덧마루가 놓입니다.' },
  { id: 'apple', name: '애플박스 놓기', key: 'b', keyLabel: 'B', icon: '<rect x="6" y="8" width="12" height="9" rx="1"/><path d="M9 12h6"/>',
    hint: '애플박스 놓기: 무대를 누르면 450 × 300 × 150 mm 애플박스가 놓입니다.' }
];

const toolDefs = TOOLS.filter((t): t is ToolDef => t !== 'sep');
const toolById = new Map(toolDefs.map(t => [t.id, t]));

/** 세트 바로가기 크기 (m). 벽·덧마루·애플박스도 모두 같은 세트다 */
const SET_PRESETS: Record<SetPieceKind, { prefix: string; width: number; depth: number; height: number }> = {
  set: { prefix: '세트', width: 2, depth: 1, height: 0.4 },
  wall: { prefix: '벽', width: 1.22, depth: 0.03, height: 2.44 },
  deck: { prefix: '덧마루', width: 1.8, depth: 0.9, height: 0.15 },
  apple: { prefix: '애플박스', width: 0.45, depth: 0.3, height: 0.15 }
};

type LensChoice = { label: string; sub?: string; lens?: LensType; zoom?: boolean };
const LENSES: LensChoice[] = [
  { label: '19°', lens: '19deg' },
  { label: '26°', lens: '26deg' },
  { label: '36°', lens: '36deg' },
  { label: '50°', lens: '51deg' },
  { label: '줌', sub: '15~50°', zoom: true }
];

let tool: ToolId = 'select';
let lensIndex = 2; // 기본 36°
let flyoutOpen = false;
let view3D = false;
/** 세트 그리기 중인 사각형 (평면 좌표) */
let draft: { start: Position2D; end: Position2D } | null = null;

type PlacedListener = (kind: 'fixture' | 'set') => void;
const placedListeners = new Set<PlacedListener>();
const redrawListeners = new Set<() => void>();

export const getTool = () => tool;
export const getSetDraft = () => draft;
/** 무언가를 놓은 직후 (shell이 알맞은 패널을 연다) */
export const onObjectPlaced = (listener: PlacedListener) => { placedListeners.add(listener); };
/** 세트 그리기 미리보기를 다시 그려야 할 때 (canvas가 등록한다) */
export const onToolRedraw = (listener: () => void) => { redrawListeners.add(listener); };

/* ---------- 도구 레일 ---------- */

const svg = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const renderRail = () => {
  const rail = document.querySelector<HTMLElement>('.toolrail');
  if (!rail) return;
  rail.innerHTML = TOOLS.map(t => {
    if (t === 'sep') return '<div class="sep"></div>';
    const disabled = view3D && t.id !== 'select';
    const title = disabled ? `${t.name} (2D 평면에서 쓸 수 있습니다)` : `${t.name} (${t.keyLabel === '␣' ? 'Space' : t.keyLabel})`;
    const button = `<button type="button" class="tool" data-tool="${t.id}" aria-pressed="${t.id === tool}" aria-label="${t.name}" title="${title}" ${disabled ? 'disabled' : ''} ${t.flyout ? `aria-expanded="${flyoutOpen}"` : ''}>
      ${svg(t.icon)}<span class="key">${t.keyLabel}</span>${t.flyout ? '<span class="more"></span>' : ''}</button>`;
    if (!t.flyout) return button;
    const flyout = flyoutOpen ? `<div class="float flyout" role="group" aria-label="엘립소이달 렌즈">${LENSES.map((l, i) =>
      `<button type="button" data-lens="${i}" aria-pressed="${i === lensIndex}">${l.label}${l.sub ? `<small>${l.sub}</small>` : ''}</button>`).join('')}</div>` : '';
    return `<div class="toolwrap">${button}${flyout}</div>`;
  }).join('');

  const def = toolById.get(tool)!;
  const hint = document.getElementById('tool-hint');
  if (hint) {
    hint.textContent = view3D
      ? '3D 보기: 사람 모형을 끌어서 옮기고, 빈 곳을 끌면 시점이 돌아갑니다. 조명 놓기와 세트 그리기는 2D 평면에서 합니다.'
      : def.id === 'ellip' ? `${def.hint} (지금 렌즈: ${LENSES[lensIndex].label})` : def.hint;
  }
  document.getElementById('canvas-wrapper')?.classList.toggle('placing', tool !== 'select');
};

export const setTool = (id: ToolId, opts: { fromKey?: boolean } = {}) => {
  if (view3D && id !== 'select') return;
  // 엘립소이달 버튼을 누르면 옆에 렌즈 고르기가 펼쳐진다. 키보드 E는 마지막 렌즈로 바로 켠다
  flyoutOpen = id === 'ellip' && !opts.fromKey ? !(tool === 'ellip' && flyoutOpen) : false;
  tool = id;
  draft = null;
  renderRail();
  redrawListeners.forEach(listener => listener());
};

/** 3D 보기에서는 선택 도구만 쓴다 */
export const setToolsViewMode = (is3D: boolean) => {
  view3D = is3D;
  if (is3D) { tool = 'select'; flyoutOpen = false; draft = null; }
  renderRail();
};

/* ---------- 놓기 ---------- */

const stageAimCenter = (): Position2D => {
  const stage = getState().stage_config;
  const seating = stage.venue_key ? VENUES[stage.venue_key as keyof typeof VENUES]?.model3d?.seating : null;
  // 객석이 있으면 객석 앞 연기 공간의 가운데, 없으면 무대 가운데를 비춘다
  return { x: stage.width / 2, y: seating ? seating.y0 / 2 : stage.depth / 2 };
};

/** 가장 가까운 캣워크 파이프에 붙인다. 극장 모형이 없으면 누른 자리 그대로 */
const snapToPipe = (point: Position2D): Position2D => {
  const stage = getState().stage_config;
  const pipes = stage.venue_key ? VENUES[stage.venue_key as keyof typeof VENUES]?.model3d?.catwalk.pipes : undefined;
  if (!pipes || pipes.length === 0) return point;
  const pipe = pipes.reduce((best, p) => Math.abs(p.y - point.y) < Math.abs(best.y - point.y) ? p : best);
  return { x: Math.min(pipe.x1, Math.max(pipe.x0, point.x)), y: pipe.y };
};

const round2 = (v: number) => Math.round(v * 100) / 100;

const placeFixture = (point: Position2D) => {
  const stage = getState().stage_config;
  const pos = snapToPipe(point);
  const center = stageAimCenter();
  const dx = center.x - pos.x, dy = center.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const reach = dist > 0.01 ? Math.min(4, dist) / dist : 0;
  const target = { x: round2(pos.x + dx * reach), y: round2(pos.y + dy * reach) };

  commitHistory();
  setState(s => {
    const cue = s.cues[s.active_cue_index];
    if (!cue) return;
    const number = nextFixtureNumber(cue.fixtures);
    let fixture: Fixture;
    if (tool === 'ellip') {
      const choice = LENSES[lensIndex];
      fixture = createFixture(choice.zoom ? 'zoom' : 'ellipsoidal', number);
      if (fixture.type === 'ellipsoidal' && choice.lens) fixture.lens_type = choice.lens;
    } else {
      fixture = createFixture(tool === 'fresnel' ? 'fresnel' : 'par', number);
    }
    fixture.position = { x: round2(pos.x), y: round2(pos.y), z: stage.default_z };
    fixture.target = target;
    cue.fixtures.push(fixture);
    s.selected_fixture_id = fixture.id;
    s.selected_fixture_ids = [fixture.id];
  });
};

const nextSetName = (prefix: string, pieces: SetPiece[]) => {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const max = pieces.reduce((m, p) => { const match = pattern.exec(p.label); return match ? Math.max(m, Number(match[1])) : m; }, 0);
  return `${prefix}${max + 1}`;
};

const placeSet = (kind: SetPieceKind, center: Position2D, size?: { width: number; depth: number }) => {
  const preset = SET_PRESETS[kind];
  commitHistory();
  setState(s => {
    const pieces = s.stage_config.set_pieces ?? (s.stage_config.set_pieces = []);
    const piece: SetPiece = {
      id: `set_${Math.random().toString(36).substring(2, 11)}`,
      label: nextSetName(preset.prefix, pieces),
      kind,
      x: round2(center.x),
      y: round2(center.y),
      width: round2(size?.width ?? preset.width),
      depth: round2(size?.depth ?? preset.depth),
      height: preset.height,
      rotation: 0,
      color: kind === 'wall' ? '#5f6a76' : '#6b5a4a'
    };
    pieces.push(piece);
    s.selected_set_id = piece.id;
  });
};

const finishPlacement = (kind: 'fixture' | 'set') => {
  setTool('select');
  placedListeners.forEach(listener => listener(kind));
};

/* ---------- 캔버스에서 부르는 함수 (선택 도구가 아니면 캔버스 마우스 입력을 여기서 처리) ---------- */

export const toolPointerDown = (world: Position2D): boolean => {
  if (tool === 'select' || view3D) return false;
  if (tool === 'set') {
    draft = { start: world, end: world };
    return true;
  }
  if (tool === 'wall' || tool === 'deck' || tool === 'apple') {
    placeSet(tool, world);
    finishPlacement('set');
    return true;
  }
  placeFixture(world);
  finishPlacement('fixture');
  return true;
};

export const toolPointerMove = (world: Position2D): boolean => {
  if (!draft) return false;
  draft.end = world;
  redrawListeners.forEach(listener => listener());
  return true;
};

export const toolPointerUp = (world: Position2D): boolean => {
  if (!draft) return false;
  const { start } = draft;
  draft = null;
  const width = Math.abs(world.x - start.x);
  const depth = Math.abs(world.y - start.y);
  if (width < 0.1 || depth < 0.1) {
    // 끌지 않고 누르기만 하면 기본 크기 세트를 그 자리에 놓는다
    placeSet('set', start);
  } else {
    placeSet('set', { x: (start.x + world.x) / 2, y: (start.y + world.y) / 2 }, { width, depth });
  }
  finishPlacement('set');
  return true;
};

/* ---------- 시작 ---------- */

export const initTools = () => {
  document.querySelector('.toolrail')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const lens = target.closest<HTMLElement>('[data-lens]');
    if (lens) {
      lensIndex = Number(lens.dataset.lens);
      flyoutOpen = false;
      tool = 'ellip';
      renderRail();
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-tool]');
    if (button && !button.disabled) setTool(button.dataset.tool as ToolId);
  });

  document.addEventListener('keydown', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey) return;
    // 작업 공간 선택 화면에서는 단축키를 쓰지 않는다
    if (document.getElementById('editor-screen')?.style.display !== 'flex') return;
    if (e.key === 'Escape') { if (tool !== 'select' || flyoutOpen) setTool('select'); return; }
    const def = toolDefs.find(t => t.key === e.key.toLowerCase());
    if (!def) return;
    e.preventDefault();
    setTool(def.id, { fromKey: true });
  });

  renderRail();
};
