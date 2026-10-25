// src/ui/tools.ts
// 왼쪽 도구 레일과 도구 모드. 선택 도구 하나가 고르기·끌기·화면 이동을 모두 맡고,
// 나머지 도구는 무언가를 "만드는" 일만 한다. 놓고 나면 선택 도구로 돌아온다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §3
// 도구 상태는 화면용이라 저장 파일과 실행 취소 기록에 들어가지 않는다.

import { commitHistory, createActor, getState, setState, subscribe } from '../state/store';
import { VENUES } from '../config/venues';
import { unavailableReason } from '../config/fixtureAvailability';
import { createFixture, nextFixtureNumber } from './fixture';
import { selectActor, selectFixture, selectSet } from './selection';
import { reportSetPlaced, resetVcb } from './statusbar';
import { setMultiActive, startMulti, type MultiKind } from './multiSelect';
import type { Fixture, LensType, PlaceableSetKind, Position2D, SetPiece } from '../types';

export type ToolId = 'select' | 'multi' | 'ellip' | 'fresnel' | 'par' | PlaceableSetKind | 'actor' | 'measure';

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
    hint: '선택: 조명·세트·사람 모형을 눌러 고르고 끌어서 옮기세요. 빈 곳을 끌면 화면이 움직이고, 휠로 확대·축소합니다. Ctrl+누르기로 여러 개를 고를 수 있습니다.' },
  { id: 'multi', name: '다중 선택', key: 'v', keyLabel: 'V', icon: '<rect x="3" y="3" width="13" height="13" rx="1" stroke-dasharray="3 2"/><path d="M13 12l8 4.5-3.5 1-1.5 3.5z"/>',
    hint: '다중 선택: 왼쪽→오른쪽으로 끌면 사각형 안에 다 든 것만, 오른쪽→왼쪽으로 끌면 걸친 것까지 고릅니다. Ctrl+누르기로 하나씩 넣고 뺍니다.' },
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
    hint: '벽 놓기: 무대를 누르면 가로 1220 · 두께 50 · 높이 2440 mm 벽이 놓입니다.' },
  { id: 'deck', name: '덧마루 놓기', key: 'd', keyLabel: 'D', icon: '<path d="M3 11l9-4 9 4-9 4z"/><path d="M3 11v2l9 4 9-4v-2"/>',
    hint: '덧마루 놓기: 무대를 누르면 1800 × 900 × 150 mm 덧마루가 놓입니다.' },
  { id: 'apple', name: '애플박스 놓기', key: 'b', keyLabel: 'B', icon: '<rect x="6" y="8" width="12" height="9" rx="1"/><path d="M9 12h6"/>',
    hint: '애플박스 놓기: 무대를 누르면 450 × 300 × 150 mm 애플박스가 놓입니다.' },
  'sep',
  { id: 'actor', name: '사람 모형 놓기', key: 'a', keyLabel: 'A', icon: '<circle cx="12" cy="5.5" r="2.5"/><path d="M12 8v7M8 11h8M9.5 21l2.5-6 2.5 6"/>',
    hint: '사람 모형 놓기: 무대를 누르면 그 자리에 배우가 섭니다. 키는 선택한 객체 속성에서 사람마다 따로 정합니다.' },
  'sep',
  { id: 'measure', name: '줄자', key: 'm', keyLabel: 'M', icon: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z"/><path d="M7 12.5l2 2M10 9.5l1.5 1.5M12.5 7l2 2"/>',
    hint: '줄자: 무대에서 시작점을 누른 채 끌어 끝점에서 놓으면 두 점 사이 거리가 나옵니다.' }
];

const toolDefs = TOOLS.filter((t): t is ToolDef => t !== 'sep');
const toolById = new Map(toolDefs.map(t => [t.id, t]));

/** 세트 바로가기 크기 (m). 벽·덧마루·애플박스도 모두 같은 세트다 */
const SET_PRESETS: Record<PlaceableSetKind, { prefix: string; width: number; depth: number; height: number }> = {
  set: { prefix: '세트', width: 2, depth: 1, height: 0.4 },
  wall: { prefix: '벽', width: 1.22, depth: 0.05, height: 2.44 },
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
let lensIndex = 2; // 기본 36°. 이 극장에 없는 렌즈면 쓸 수 있는 첫 렌즈를 쓴다 (usableLens)
let flyoutOpen = false;
let view3D = false;
/** 세트 그리기 중인 사각형 (평면 좌표) */
let draft: { start: Position2D; end: Position2D } | null = null;
/** 줄자로 잰 선 (평면 좌표). 끄는 중이면 dragging */
let measure: { start: Position2D; end: Position2D; dragging: boolean } | null = null;

const redrawListeners = new Set<() => void>();
const changeListeners = new Set<() => void>();

const VIEW3D_HINT = '3D 보기: 조명을 누르면 조명 설정이 열리고, 사람 모형은 끌어서 옮깁니다. 빈 곳을 끌면 시점이 돌아갑니다. 조명 놓기와 세트 그리기는 2D 평면에서 합니다.';

/** 도우미 패널의 "다음에 일어나는 일" */
const TOOL_NEXT: Record<ToolId, string> = {
  multi: '고른 것 중 하나를 끌면 모두 같이 움직입니다. 조명을 고르면 조준점도 함께 골라져 같이 옮겨지고, Ctrl+누르기로 조준점만 빼면 조준점은 제자리에 남습니다(회색 점선). 조준점만 골라 옮길 수도 있습니다. Delete로 한꺼번에 지우고, Ctrl+Z 한 번으로 되돌립니다. 2D 평면에서만 쓸 수 있고, Esc나 다른 도구를 고르면 선택이 풀립니다.',
  select: '고른 대상에 따라 오른쪽에 조명 설정이나 선택한 객체 속성이 열립니다. 조명·세트·사람 모형을 끈 직후 숫자를 치고 Enter를 누르면, 끈 방향으로 그 거리만큼 정확히 옮깁니다 (mm, 예: 2500).',
  ellip: '놓은 뒤에는 선택 도구로 돌아오고, 새 조명의 조명 설정이 열립니다. 조준점은 무대 앞쪽 연기 공간 가운데를 향합니다.',
  fresnel: '놓은 뒤에는 선택 도구로 돌아오고, 새 조명의 조명 설정이 열립니다.',
  par: '놓은 뒤에는 선택 도구로 돌아오고, 새 조명의 조명 설정이 열립니다. PAR 램프는 MFL이고, 회전은 조명 설정에서 바꿉니다.',
  set: '그린 직후 숫자를 치고 Enter를 누르면 그 값이 세트 높이가 됩니다 (mm, 예: 900). 크기와 각도는 손잡이로 고칩니다.',
  wall: '놓은 뒤에는 선택 도구로 돌아옵니다. 꼭짓점 손잡이로 크기를, 노란 손잡이로 각도를 바꾸고, 바로 숫자를 치면 높이가 바뀝니다.',
  deck: '놓은 뒤에는 선택 도구로 돌아옵니다. 꼭짓점 손잡이로 크기를, 노란 손잡이로 각도를 바꾸고, 바로 숫자를 치면 높이가 바뀝니다.',
  apple: '놓은 뒤에는 선택 도구로 돌아옵니다. 꼭짓점 손잡이로 크기를, 노란 손잡이로 각도를 바꾸고, 바로 숫자를 치면 높이가 바뀝니다.',
  actor: '놓은 뒤에는 선택 도구로 돌아오고, 그 사람의 선택한 객체 속성(키·의상 색·얼굴 밝기)을 볼 수 있습니다. 사람 모형은 여러 명 세울 수 있습니다.',
  measure: '잰 선은 다시 재거나 다른 도구를 고르거나 Esc를 누를 때까지 남습니다. 작업에는 저장되지 않습니다. 줄자는 여러 번 잴 수 있도록 선택 도구로 돌아가지 않습니다.'
};

/* ---------- 극장에 없는 조명 (config/fixtureAvailability.ts) ---------- */

const lensReason = (choice: LensChoice) => unavailableReason(getState().stage_config, choice.zoom ? 'zoom' : 'fixed');

/** 이 극장에 없는 도구면 그 안내 문구 */
const toolReason = (id: ToolId): string | null => {
  const stage = getState().stage_config;
  if (id === 'par' || id === 'fresnel') return unavailableReason(stage, id);
  if (id === 'ellip' && LENSES.every(choice => lensReason(choice))) return lensReason(LENSES[0]);
  return null;
};

/** 지금 고른 렌즈. 이 극장에 없으면 쓸 수 있는 첫 렌즈 (두레문예관 = 줌) */
const usableLens = (): number => {
  if (!lensReason(LENSES[lensIndex])) return lensIndex;
  const first = LENSES.findIndex(choice => !lensReason(choice));
  return first >= 0 ? first : lensIndex;
};

/** 막힌 도구·렌즈를 누르면 아래 상태 바에 이유를 보여 준다 */
const showReason = (reason: string) => {
  const hint = document.getElementById('tool-hint');
  if (hint) hint.textContent = reason;
};

export interface ToolHelp { name: string; keyLabel: string; hint: string; next: string; view3D: boolean; }

/** 도우미 패널에 보여 줄 지금 도구의 설명 */
export const getToolHelp = (): ToolHelp => {
  const def = toolById.get(tool)!;
  return {
    name: view3D ? '3D 보기' : def.name,
    keyLabel: def.keyLabel === '␣' ? 'Space' : def.keyLabel,
    hint: view3D ? VIEW3D_HINT : def.id === 'ellip' ? `${def.hint} (지금 렌즈: ${LENSES[usableLens()].label})` : def.hint,
    next: view3D ? '3D에서는 선택 도구만 씁니다. 2D 평면으로 돌아가면 다른 도구를 다시 쓸 수 있습니다.' : TOOL_NEXT[def.id],
    view3D
  };
};
/** 도구나 렌즈, 2D/3D가 바뀔 때 (도우미 패널이 등록한다) */
export const onToolChange = (listener: () => void) => { changeListeners.add(listener); };

export const getTool = () => tool;
export const getSetDraft = () => draft;
/** 줄자 선: 줄자 도구일 때만 보인다 (canvas가 그린다) */
export const getMeasure = () => (tool === 'measure' ? measure : null);

/** 줄자 거리 글: 3,450 mm (가로 3,000 · 세로 1,700) */
export const measureText = (m: { start: Position2D; end: Position2D }) => {
  const mm = (v: number) => Math.round(v * 1000).toLocaleString('ko-KR');
  const dx = Math.abs(m.end.x - m.start.x);
  const dy = Math.abs(m.end.y - m.start.y);
  return { length: `${mm(Math.hypot(dx, dy))} mm`, parts: `가로 ${mm(dx)} · 세로 ${mm(dy)} mm` };
};

const reportMeasure = () => {
  if (!measure) return;
  const { length, parts } = measureText(measure);
  showReason(`줄자: ${length} (${parts})`);
};
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
    // 이 극장에 없는 조명: 누를 수는 있지만(마우스를 올리면 이유가 보이도록 disabled를 쓰지 않는다) 놓지 않는다
    const missing = toolReason(t.id);
    const title = disabled ? `${t.name} (2D 평면에서 쓸 수 있습니다)` : missing ?? `${t.name} (${t.keyLabel === '␣' ? 'Space' : t.keyLabel})`;
    const button = `<button type="button" class="tool" data-tool="${t.id}" aria-pressed="${t.id === tool}" aria-label="${t.name}" title="${title}" ${disabled ? 'disabled' : ''} ${missing ? 'aria-disabled="true"' : ''} ${t.flyout ? `aria-expanded="${flyoutOpen}"` : ''}>
      ${svg(t.icon)}<span class="key">${t.keyLabel}</span>${t.flyout ? '<span class="more"></span>' : ''}<span class="lbl">${t.name}</span></button>`;
    if (!t.flyout) return button;
    const current = usableLens();
    const flyout = flyoutOpen ? `<div class="float flyout" role="group" aria-label="엘립소이달 렌즈">${LENSES.map((l, i) => {
      const reason = lensReason(l);
      return `<button type="button" data-lens="${i}" aria-pressed="${i === current}" ${reason ? `aria-disabled="true" title="${reason}"` : ''}>${l.label}${l.sub ? `<small>${l.sub}</small>` : ''}</button>`;
    }).join('')}</div>` : '';
    return `<div class="toolwrap ${flyoutOpen ? 'open' : ''}">${button}${flyout}</div>`;
  }).join('');

  const hint = document.getElementById('tool-hint');
  if (hint) hint.textContent = getToolHelp().hint;
  document.getElementById('canvas-wrapper')?.classList.toggle('placing', tool !== 'select');
  changeListeners.forEach(listener => listener());
};

export const setTool = (id: ToolId, opts: { fromKey?: boolean; extra?: { kind: MultiKind; id: string } } = {}) => {
  if (view3D && id !== 'select') return;
  const missing = toolReason(id);
  if (missing) { showReason(missing); return; }
  // 엘립소이달 버튼을 누르면 옆에 렌즈 고르기가 펼쳐진다. 키보드 E는 마지막 렌즈로 바로 켠다
  flyoutOpen = id === 'ellip' && !opts.fromKey ? !(tool === 'ellip' && flyoutOpen) : false;
  const wasMulti = tool === 'multi';
  tool = id;
  draft = null;
  if (id !== 'measure') measure = null;
  renderRail();
  setMultiActive(id === 'multi');
  if (id === 'multi' && !wasMulti) startMulti(opts.extra);
  redrawListeners.forEach(listener => listener());
};

/** 3D 보기에서는 선택 도구만 쓴다 */
export const setToolsViewMode = (is3D: boolean) => {
  view3D = is3D;
  if (is3D) { tool = 'select'; flyoutOpen = false; draft = null; setMultiActive(false); }
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
  const pipes = stage.venue_key ? VENUES[stage.venue_key as keyof typeof VENUES]?.model3d?.catwalk?.pipes : undefined;
  if (!pipes || pipes.length === 0) return point;
  const pipe = pipes.reduce((best, p) => Math.abs(p.y - point.y) < Math.abs(best.y - point.y) ? p : best);
  return { x: Math.min(pipe.x1, Math.max(pipe.x0, point.x)), y: pipe.y };
};

const round2 = (v: number) => Math.round(v * 100) / 100;

const placeFixture = (point: Position2D): string | null => {
  const stage = getState().stage_config;
  const pos = snapToPipe(point);
  const center = stageAimCenter();
  const dx = center.x - pos.x, dy = center.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const reach = dist > 0.01 ? Math.min(4, dist) / dist : 0;
  const target = { x: round2(pos.x + dx * reach), y: round2(pos.y + dy * reach) };

  let placedId: string | null = null;
  commitHistory();
  setState(s => {
    const cue = s.cues[s.active_cue_index];
    if (!cue) return;
    const number = nextFixtureNumber(cue.fixtures);
    let fixture: Fixture;
    if (tool === 'ellip') {
      const choice = LENSES[usableLens()];
      fixture = createFixture(choice.zoom ? 'zoom' : 'ellipsoidal', number);
      if (fixture.type === 'ellipsoidal' && choice.lens) fixture.lens_type = choice.lens;
    } else {
      fixture = createFixture(tool === 'fresnel' ? 'fresnel' : 'par', number);
    }
    fixture.position = { x: round2(pos.x), y: round2(pos.y), z: stage.default_z };
    fixture.target = target;
    cue.fixtures.push(fixture);
    placedId = fixture.id;
  });
  return placedId;
};

const nextSetName = (prefix: string, pieces: SetPiece[]) => {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const max = pieces.reduce((m, p) => { const match = pattern.exec(p.label); return match ? Math.max(m, Number(match[1])) : m; }, 0);
  return `${prefix}${max + 1}`;
};

const placeSet = (kind: PlaceableSetKind, center: Position2D, size?: { width: number; depth: number }): string => {
  const preset = SET_PRESETS[kind];
  const id = `set_${Math.random().toString(36).substring(2, 11)}`;
  commitHistory();
  setState(s => {
    const pieces = s.stage_config.set_pieces ?? (s.stage_config.set_pieces = []);
    const piece: SetPiece = {
      id,
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
  });
  return id;
};

/** 놓은 뒤에는 선택 도구로 돌아오고, 새 대상을 골라 그 패널을 연다 */
const finishPlacement = (kind: 'fixture' | 'set' | 'actor', id: string | null) => {
  // 세트를 놓은 직후에는 아래 "수치" 칸에 높이를 칠 수 있다
  if (kind === 'set' && id) reportSetPlaced(id); else resetVcb();
  setTool('select');
  if (!id) return;
  if (kind === 'fixture') selectFixture(id);
  else if (kind === 'set') selectSet(id);
  else selectActor(id);
};

/** 누른 자리에 사람 모형을 세운다 */
const placeActor = (point: Position2D): string => {
  const stage = getState().stage_config;
  const actor = createActor(
    Math.min(stage.width, Math.max(0, Number(point.x.toFixed(2)))),
    Math.min(stage.depth, Math.max(0, Number(point.y.toFixed(2)))),
    getState().actors
  );
  commitHistory();
  setState(s => { s.actors.push(actor); });
  return actor.id;
};

/* ---------- 캔버스에서 부르는 함수 (선택 도구가 아니면 캔버스 마우스 입력을 여기서 처리) ---------- */

export const toolPointerDown = (world: Position2D): boolean => {
  if (tool === 'select' || tool === 'multi' || view3D) return false;
  if (tool === 'measure') {
    measure = { start: world, end: world, dragging: true };
    reportMeasure();
    redrawListeners.forEach(listener => listener());
    return true;
  }
  if (tool === 'set') {
    draft = { start: world, end: world };
    return true;
  }
  if (tool === 'wall' || tool === 'deck' || tool === 'apple') {
    finishPlacement('set', placeSet(tool, world));
    return true;
  }
  if (tool === 'actor') {
    finishPlacement('actor', placeActor(world));
    return true;
  }
  finishPlacement('fixture', placeFixture(world));
  return true;
};

export const toolPointerMove = (world: Position2D): boolean => {
  if (measure?.dragging) {
    measure.end = world;
    reportMeasure();
    redrawListeners.forEach(listener => listener());
    return true;
  }
  if (!draft) return false;
  draft.end = world;
  redrawListeners.forEach(listener => listener());
  return true;
};

export const toolPointerUp = (world: Position2D): boolean => {
  if (measure?.dragging) {
    measure.end = world;
    measure.dragging = false;
    reportMeasure();
    redrawListeners.forEach(listener => listener());
    return true;
  }
  if (!draft) return false;
  const { start } = draft;
  draft = null;
  const width = Math.abs(world.x - start.x);
  const depth = Math.abs(world.y - start.y);
  // 끌지 않고 누르기만 하면 기본 크기 세트를 그 자리에 놓는다
  const id = width < 0.1 || depth < 0.1
    ? placeSet('set', start)
    : placeSet('set', { x: (start.x + world.x) / 2, y: (start.y + world.y) / 2 }, { width, depth });
  finishPlacement('set', id);
  return true;
};

/* ---------- 시작 ---------- */

export const initTools = () => {
  document.querySelector('.toolrail')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const lens = target.closest<HTMLElement>('[data-lens]');
    if (lens) {
      const reason = lensReason(LENSES[Number(lens.dataset.lens)]);
      if (reason) { showReason(reason); return; }
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

  // 다른 극장의 작업을 열면 쓸 수 있는 조명이 바뀐다
  let venueKey = getState().stage_config.venue_key;
  subscribe(() => {
    const next = getState().stage_config.venue_key;
    if (next === venueKey) return;
    venueKey = next;
    if (toolReason(tool)) tool = 'select';
    renderRail();
  });

  renderRail();
};
