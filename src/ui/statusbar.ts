// src/ui/statusbar.ts
// 아래 상태 바의 커서 좌표와 "수치" 칸 (SketchUp의 측정 칸, VCB).
//   - 조명·세트·사람 모형을 끄는 중이나 끈 직후: 숫자를 치고 Enter → 끈 방향으로 그 거리만큼 정확히 옮긴다
//   - 세트를 그리거나 놓은 직후: 숫자를 치고 Enter → 그 세트의 높이가 된다
// 숫자는 m 단위이고, "900mm", "90cm"처럼 단위를 붙여도 된다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §7

import { commitHistory, getState, setState } from '../state/store';
import type { Position2D } from '../types';

export type MovableKind = 'fixture' | 'set' | 'actor';

type VcbContext =
  | { type: 'move'; kind: MovableKind; id: string; from: Position2D; to: Position2D }
  | { type: 'height'; setId: string }
  | null;

let context: VcbContext = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** "2.5", "2,5", "900mm", "90 cm" → m. 읽을 수 없으면 null */
export const parseLength = (text: string): number | null => {
  const m = text.trim().replace(',', '.').match(/^(-?\d*\.?\d+)\s*(mm|cm|m)?$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = (m[2] ?? 'm').toLowerCase();
  const meters = unit === 'mm' ? value / 1000 : unit === 'cm' ? value / 100 : value;
  return Number.isFinite(meters) ? meters : null;
};

const objectPosition = (kind: MovableKind, id: string): Position2D | null => {
  const state = getState();
  if (kind === 'actor') return { x: state.probe.x, y: state.probe.y };
  if (kind === 'set') {
    const piece = (state.stage_config.set_pieces ?? []).find(p => p.id === id);
    return piece ? { x: piece.x, y: piece.y } : null;
  }
  const fix = state.cues[state.active_cue_index]?.fixtures.find(f => f.id === id);
  return fix ? { x: fix.position.x, y: fix.position.y } : null;
};

const renderVcb = () => {
  const input = $<HTMLInputElement>('vcb');
  const label = $('vcb-label');
  if (!input || !label) return;
  const focused = document.activeElement === input;
  if (context?.type === 'move') {
    label.textContent = '거리';
    const d = Math.hypot(context.to.x - context.from.x, context.to.y - context.from.y);
    if (!focused) input.value = `${d.toFixed(2)} m`;
    input.title = '숫자를 치고 Enter를 누르면 방금 끈 방향으로 그 거리만큼 정확히 옮깁니다 (예: 2.5, 900mm)';
  } else if (context?.type === 'height') {
    label.textContent = '높이';
    const setId = context.setId;
    const piece = (getState().stage_config.set_pieces ?? []).find(p => p.id === setId);
    if (!focused) input.value = piece ? `${Math.round(piece.height * 1000)} mm` : '';
    input.title = '숫자를 치고 Enter를 누르면 방금 놓은 세트의 높이가 됩니다 (예: 0.9, 900mm)';
  } else {
    label.textContent = '수치';
    if (!focused) input.value = '';
    input.title = '물체를 끈 직후에는 거리, 세트를 놓은 직후에는 높이를 숫자로 정합니다';
  }
  input.classList.remove('invalid');
};

/* ---------- 캔버스·도구가 알려 주는 것 ---------- */

/** 캔버스 위 커서 위치 (m). 캔버스 밖이면 null */
export const reportPointer = (p: Position2D | null) => {
  const el = $('cursor-pos');
  if (el) el.textContent = p ? `X ${p.x.toFixed(2)} m  Y ${p.y.toFixed(2)} m` : 'X —  Y —';
};

/** 끌어서 옮기는 중 (from은 끌기 시작 위치) */
export const reportMove = (kind: MovableKind, id: string, from: Position2D, to: Position2D) => {
  context = { type: 'move', kind, id, from, to };
  renderVcb();
};

/** 세트를 막 그렸거나 놓았다 */
export const reportSetPlaced = (setId: string) => {
  context = { type: 'height', setId };
  renderVcb();
};

/** 다른 일을 시작했으므로 수치 칸이 가리키던 대상을 잊는다 */
export const resetVcb = () => {
  context = null;
  renderVcb();
};

/* ---------- 수치 적용 ---------- */

const applyVcb = (text: string): boolean => {
  const value = parseLength(text);
  if (value === null || !context) return false;

  if (context.type === 'height') {
    if (value <= 0) return false;
    const id = context.setId;
    if (!(getState().stage_config.set_pieces ?? []).some(p => p.id === id)) return false;
    commitHistory();
    setState(s => {
      const piece = (s.stage_config.set_pieces ?? []).find(p => p.id === id);
      if (piece) piece.height = Math.max(0.01, Math.round(value * 1000) / 1000);
    });
    return true;
  }

  const { kind, id, from, to } = context;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6 || !objectPosition(kind, id)) return false;
  const target = { x: from.x + dx / length * value, y: from.y + dy / length * value };
  commitHistory();
  setState(s => {
    s.interaction.dragMode = null; // 끄는 중이었다면 여기서 끝낸다
    if (kind === 'actor') {
      s.probe.x = Math.min(s.stage_config.width, Math.max(0, target.x));
      s.probe.y = Math.min(s.stage_config.depth, Math.max(0, target.y));
    } else if (kind === 'set') {
      const piece = (s.stage_config.set_pieces ?? []).find(p => p.id === id);
      if (piece) { piece.x = Number(target.x.toFixed(3)); piece.y = Number(target.y.toFixed(3)); }
    } else {
      const fix = s.cues[s.active_cue_index]?.fixtures.find(f => f.id === id);
      if (fix) { fix.position.x = Number(target.x.toFixed(3)); fix.position.y = Number(target.y.toFixed(3)); }
    }
  });
  const now = objectPosition(kind, id);
  if (now) context = { type: 'move', kind, id, from, to: now };
  return true;
};

export const initStatusBar = () => {
  const input = $<HTMLInputElement>('vcb');
  if (!input) return;

  input.addEventListener('keydown', e => {
    e.stopPropagation(); // 도구 단축키가 먹지 않게
    if (e.key === 'Enter') {
      if (applyVcb(input.value)) { input.blur(); renderVcb(); } else input.classList.add('invalid');
    }
    if (e.key === 'Escape') { input.blur(); renderVcb(); }
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('blur', () => renderVcb());

  // SketchUp처럼 따로 누르지 않아도, 끈 직후나 놓은 직후에 숫자를 치면 수치 칸으로 들어간다
  document.addEventListener('keydown', e => {
    if (!context || e.ctrlKey || e.metaKey || e.altKey || !/^[0-9.]$/.test(e.key)) return;
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.getElementById('editor-screen')?.style.display !== 'flex') return;
    e.preventDefault();
    input.focus();
    input.value = e.key;
  });

  reportPointer(null);
  renderVcb();
};
