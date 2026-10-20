// src/render/canvas.ts

import { getState, setState, getCurrentCue, subscribe, commitHistory, actorFaceHeight } from '../state/store';
import { GeometryEngine } from '../engine/geometry';
import { gelDisplayHex } from '../engine/gels';
import { dimmerOutput, getPhotometry } from '../engine/photometrics';
import { reportMove, reportPointer, type MovableKind } from '../ui/statusbar';
import { getSetDraft, getTool, onToolRedraw, toolPointerDown, toolPointerMove, toolPointerUp } from '../ui/tools';
import { clearSelection, openSelected, selectActor, selectFixture, selectSet } from '../ui/selection';
import type { Actor, Position2D, Cue, Fixture, UIToggles, StageConfig, SetPiece } from '../types';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let canvasWrapper: HTMLElement | null = null;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let viewZoom = 1;
const viewListeners = new Set<() => void>();

/** 확대 비율(1 = 무대 전체가 보이는 크기) */
export const getViewZoom = () => viewZoom;
/** 화면 확대·이동이 바뀔 때마다 부른다 (상태 바 표시용) */
export const onViewChange = (listener: () => void) => { viewListeners.add(listener); };
/** 무대 좌표(m)를 캔버스 안의 CSS 픽셀 좌표로 바꾼다 (상태 바·시험용) */
export const worldToScreen = (p: Position2D): Position2D => ({ x: offsetX + p.x * scale, y: offsetY + p.y * scale });
let viewPanX = 0;
let viewPanY = 0;
let isViewPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let lastViewPanEndAt = 0;

const imageCache = new Map<string, HTMLImageElement>();
/** 세트를 끌 때 클릭한 지점과 세트 중심 사이의 거리 */
let setDragOffset: Position2D = { x: 0, y: 0 };
/** 끌기를 시작했지만 아직 움직이지 않음 (움직이는 순간 실행 취소 기록을 남긴다) */
let dragHistoryPending = false;
/** 옮기기 끌기의 시작 위치: 아래 "수치" 칸이 정확한 거리로 다시 옮길 때 쓴다 */
let moveStart: { kind: MovableKind; id: string; from: Position2D } | null = null;
/** 세트 꼭짓점을 끌 때 움직이지 않는 반대쪽 꼭짓점 (m) */
let setFixedCorner: Position2D = { x: 0, y: 0 };

/* ---------- 세트 손잡이 (파워포인트 방식, 사양 §4) ---------- */
const HANDLE_RADIUS_PX = 6;
const HANDLE_HIT_PX = 10;
const ROTATE_STICK_PX = 26;
const ROTATE_SNAP_DEG = 15;
const ROTATE_SNAP_RANGE_DEG = 3;
const MIN_SET_SIZE = 0.05;

/** 세트의 지역 좌표(가로 축 lx, 깊이 축 ly)를 무대 좌표로 바꾼다 */
const setLocalToWorld = (piece: SetPiece, lx: number, ly: number): Position2D => {
  const r = piece.rotation * Math.PI / 180;
  return { x: piece.x + lx * Math.cos(r) - ly * Math.sin(r), y: piece.y + lx * Math.sin(r) + ly * Math.cos(r) };
};

/** 회전 손잡이: 위쪽 변(깊이 축 음수 쪽) 가운데에서 화면 기준 일정 거리만큼 떨어져 있다 */
const setRotateHandle = (piece: SetPiece): Position2D =>
  setLocalToWorld(piece, 0, -piece.depth / 2 - ROTATE_STICK_PX / scale);

type SetHandleHit = { kind: 'corner'; index: number } | { kind: 'rotate' } | null;

const hitSetHandle = (piece: SetPiece, point: Position2D): SetHandleHit => {
  const near = (p: Position2D) => Math.hypot(point.x - p.x, point.y - p.y) * scale <= HANDLE_HIT_PX;
  if (near(setRotateHandle(piece))) return { kind: 'rotate' };
  const corners = setPieceCorners(piece);
  for (let i = 0; i < 4; i++) if (near(corners[i])) return { kind: 'corner', index: i };
  return null;
};

/** 15° 배수 근처(±3°)면 그 각도로 붙인다. 결과는 -180 초과 180 이하 */
const snapRotation = (deg: number) => {
  const nearest = Math.round(deg / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
  const snapped = Math.abs(deg - nearest) <= ROTATE_SNAP_RANGE_DEG ? nearest : Math.round(deg);
  const wrapped = ((snapped + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
};

/** 꼭짓점 커서: 회전한 세트에서도 대각선 방향에 맞는 화살표를 고른다 */
const cornerCursor = (piece: SetPiece, index: number) => {
  const c = setPieceCorners(piece)[index];
  const angle = Math.atan2(c.y - piece.y, c.x - piece.x) * 180 / Math.PI;
  const a = ((angle % 180) + 180) % 180; // 0~180
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
};

const drawSetHandles = (targetCtx: CanvasRenderingContext2D, piece: SetPiece) => {
  const sx = (p: Position2D) => offsetX + toPx(p.x);
  const sy = (p: Position2D) => offsetY + toPx(p.y);
  const topMid = setLocalToWorld(piece, 0, -piece.depth / 2);
  const rot = setRotateHandle(piece);
  targetCtx.save();
  // 회전 손잡이 막대와 노란 원
  targetCtx.strokeStyle = '#1f6fd1';
  targetCtx.lineWidth = 1.5;
  targetCtx.beginPath();
  targetCtx.moveTo(sx(topMid), sy(topMid));
  targetCtx.lineTo(sx(rot), sy(rot));
  targetCtx.stroke();
  targetCtx.fillStyle = '#f5c400';
  targetCtx.beginPath();
  targetCtx.arc(sx(rot), sy(rot), HANDLE_RADIUS_PX + 1, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.stroke();
  // 꼭짓점: 흰 원 + 파란 테두리
  targetCtx.fillStyle = '#ffffff';
  setPieceCorners(piece).forEach(c => {
    targetCtx.beginPath();
    targetCtx.arc(sx(c), sy(c), HANDLE_RADIUS_PX, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.stroke();
  });
  targetCtx.restore();
};

/** 선택 도구로 세트 손잡이 위에 있으면 알맞은 커서를 보여 준다 */
const updateHoverCursor = (e: MouseEvent) => {
  if (!canvas) return;
  let cursor = '';
  const state = getState();
  const piece = (state.stage_config.set_pieces ?? []).find(p => p.id === state.selected_set_id);
  if (piece && getTool() === 'select' && !isViewPanning) {
    const rect = canvas.getBoundingClientRect();
    const hit = hitSetHandle(piece, toWorld(e.clientX - rect.left, e.clientY - rect.top));
    if (hit?.kind === 'rotate') cursor = 'grab';
    else if (hit?.kind === 'corner') cursor = cornerCursor(piece, hit.index);
  }
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
};

/** 크기·회전을 바꾸는 동안 세트 옆에 치수나 각도를 띄운다 */
const drawSetDragReadout = (targetCtx: CanvasRenderingContext2D, piece: SetPiece, mode: 'set-corner' | 'set-rotate') => {
  const text = mode === 'set-corner'
    ? `${Math.round(piece.width * 1000)} × ${Math.round(piece.depth * 1000)} mm`
    : `${Math.round(piece.rotation)}°`;
  const anchor = mode === 'set-rotate' ? setRotateHandle(piece) : setLocalToWorld(piece, 0, piece.depth / 2);
  const x = offsetX + toPx(anchor.x);
  const y = offsetY + toPx(anchor.y) + (mode === 'set-rotate' ? -18 : 20);
  targetCtx.save();
  targetCtx.font = '600 12px "IBM Plex Mono", Consolas, monospace';
  const w = targetCtx.measureText(text).width + 12;
  targetCtx.fillStyle = 'rgba(29, 39, 51, 0.92)';
  targetCtx.beginPath();
  targetCtx.roundRect(x - w / 2, y - 11, w, 22, 5);
  targetCtx.fill();
  targetCtx.fillStyle = '#ffffff';
  targetCtx.textAlign = 'center';
  targetCtx.fillText(text, x, y + 4);
  targetCtx.restore();
};

const setPieceCorners = (piece: SetPiece): Position2D[] => {
  const r = piece.rotation * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = sx * piece.width / 2;
    const ly = sy * piece.depth / 2;
    return { x: piece.x + lx * cos - ly * sin, y: piece.y + lx * sin + ly * cos };
  });
};

const pointInSetPiece = (point: Position2D, piece: SetPiece): boolean => {
  const r = -piece.rotation * Math.PI / 180;
  const dx = point.x - piece.x;
  const dy = point.y - piece.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= piece.width / 2 && Math.abs(ly) <= piece.depth / 2;
};

const drawSetPieces = (targetCtx: CanvasRenderingContext2D, pieces: SetPiece[], selectedId: string | null | undefined) => {
  pieces.forEach(piece => {
    const corners = setPieceCorners(piece);
    const selected = piece.id === selectedId;
    targetCtx.save();
    targetCtx.beginPath();
    corners.forEach((p, i) => {
      const px = offsetX + toPx(p.x);
      const py = offsetY + toPx(p.y);
      if (i === 0) targetCtx.moveTo(px, py); else targetCtx.lineTo(px, py);
    });
    targetCtx.closePath();
    targetCtx.globalAlpha = 0.55;
    targetCtx.fillStyle = piece.color;
    targetCtx.fill();
    targetCtx.globalAlpha = 1;
    targetCtx.lineWidth = selected ? 2.5 : 1.5;
    targetCtx.strokeStyle = selected ? '#ffd166' : 'rgba(255, 255, 255, 0.7)';
    targetCtx.setLineDash(selected ? [] : [5, 3]);
    targetCtx.stroke();
    targetCtx.setLineDash([]);
    targetCtx.fillStyle = '#fff';
    targetCtx.font = '11px "Segoe UI", sans-serif';
    targetCtx.textAlign = 'center';
    targetCtx.fillText(`${piece.label} (${piece.height}m)`, offsetX + toPx(piece.x), offsetY + toPx(piece.y) + 4);
    targetCtx.restore();
  });
};

const toPx = (m: number, s = scale): number => m * s;
const toWorld = (px: number, py: number): Position2D => ({
  x: (px - offsetX) / scale,
  y: (py - offsetY) / scale
});

const drawImageLayer = (
  targetCtx: CanvasRenderingContext2D,
  source: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opacity: number,
  currentScale: number,
  currentOffsetX: number,
  currentOffsetY: number,
  blendMode: GlobalCompositeOperation = 'source-over'
) => {
  let img = imageCache.get(source);

  if (!img) {
    img = new Image();
    img.src = source;
    imageCache.set(source, img);
    img.onload = () => requestAnimationFrame(renderCanvas);
  }

  if (img.complete && img.naturalWidth !== 0) {
    targetCtx.save();
    targetCtx.globalAlpha = opacity;
    targetCtx.globalCompositeOperation = blendMode;
    targetCtx.drawImage(
      img,
      currentOffsetX + toPx(x, currentScale),
      currentOffsetY + toPx(y, currentScale),
      toPx(width, currentScale),
      toPx(height, currentScale)
    );
    targetCtx.restore();
  }
};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * 바닥에 닿는 빛을 그라데이션으로 그린다. 필드 타원을 단위원으로 보고, 가운데에서 바깥으로
 * 광도 모델의 상대 밝기 10^(-r^p)(빔 50%, 필드 10%)를 따라 옅어진다. 젤 색과 디머를 반영한다.
 */
const drawLightPool = (
  targetCtx: CanvasRenderingContext2D,
  fix: Fixture,
  field: { cx: number; cy: number; radiusX: number; radiusY: number; rotation: number },
  currentScale: number,
  isSelected: boolean
) => {
  const rx = toPx(field.radiusX, currentScale);
  const ry = toPx(field.radiusY, currentScale);
  if (rx < 0.5 || ry < 0.5) return;
  const p = getPhotometry(fix).exponent;
  const [r, g, b] = hexToRgb(gelDisplayHex(fix.gel));
  const strength = (isSelected ? 0.62 : 0.5) * (0.35 + 0.65 * Math.sqrt(dimmerOutput(fix)));
  const reach = 1.35; // 필드 바깥으로 남는 빛까지 조금 더 그린다

  targetCtx.save();
  targetCtx.translate(toPx(field.cx, currentScale), toPx(field.cy, currentScale));
  targetCtx.rotate(field.rotation);
  targetCtx.scale(rx, ry);
  const gradient = targetCtx.createRadialGradient(0, 0, 0, 0, 0, reach);
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * reach;
    const rel = Math.pow(10, -Math.pow(t, p));
    gradient.addColorStop(t / reach, `rgba(${r}, ${g}, ${b}, ${(rel * strength).toFixed(3)})`);
  }
  targetCtx.globalCompositeOperation = 'screen';
  targetCtx.fillStyle = gradient;
  targetCtx.beginPath();
  targetCtx.arc(0, 0, reach, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.restore();
};

// [추가됨] 순수하게 캔버스 Context에 조명만 그리는 헬퍼 함수
export const drawCueToContext = (
  targetCtx: CanvasRenderingContext2D,
  cue: Cue,
  currentScale: number,
  currentOffsetX: number,
  currentOffsetY: number,
  toggles: UIToggles,
  stageConfig: StageConfig,
  selectedFixtureIds: string[] = [],
  activeFixtureId: string | null = null,
  actors: Actor[] | null = null,
  selectedActorId: string | null = null
) => {
  const actorH = stageConfig.actor_height;

  // --- 배경 이미지 렌더링 로직 시작 ---
  if (cue.background) {
    const bg = cue.background;
    drawImageLayer(targetCtx, bg.dataUrl, bg.x, bg.y, bg.width, bg.height, bg.opacity, currentScale, currentOffsetX, currentOffsetY);
  }
  // --- 배경 이미지 렌더링 로직 끝 ---

  cue.fixtures.forEach(fix => {
    if (fix.is_visible === false) return;

    const isSelected = selectedFixtureIds.includes(fix.id) || fix.id === activeFixtureId;
    const isActiveFixture = fix.id === activeFixtureId;
    
    const hasShutters = GeometryEngine.fixtureHasShutters(fix);
    const floorPolygons = hasShutters ? fix.shutter_polygon.map(p => ({
      x: fix.target.x + p.dx,
      y: fix.target.y + p.dy
    })) : [];
    const facePolygons = floorPolygons.map(p =>
      GeometryEngine.projectFloorToFace(p.x, p.y, fix.position.z, actorH, fix.position.x, fix.position.y)
    );

    // 바닥 빛 영역(그라데이션)에는 필드 타원이 늘 필요하다. 선은 보기 설정에 따라 그린다.
    const floorField = (toggles.show_floor || toggles.show_field) ? GeometryEngine.calculateEllipse(fix, 0, 'field') : null;
    const floorBeam = toggles.show_beam ? GeometryEngine.calculateEllipse(fix, 0, 'beam') : null;
    const faceField = toggles.show_face ? GeometryEngine.calculateEllipse(fix, actorH, 'field') : null;
    const faceBeam = toggles.show_face && toggles.show_beam ? GeometryEngine.calculateEllipse(fix, actorH, 'beam') : null;

    targetCtx.save();
    targetCtx.translate(currentOffsetX, currentOffsetY);

    const clipShutter = (polygon: Position2D[]) => {
      if (!(hasShutters && fix.shutter_active)) return;
      targetCtx.beginPath();
      targetCtx.moveTo(toPx(polygon[0].x, currentScale), toPx(polygon[0].y, currentScale));
      for (let k = 1; k < 4; k++) targetCtx.lineTo(toPx(polygon[k].x, currentScale), toPx(polygon[k].y, currentScale));
      targetCtx.closePath();
      targetCtx.clip();
    };
    const strokeEllipse = (e: { cx: number; cy: number; radiusX: number; radiusY: number; rotation: number }) => {
      targetCtx.beginPath();
      targetCtx.ellipse(toPx(e.cx, currentScale), toPx(e.cy, currentScale), toPx(e.radiusX, currentScale), toPx(e.radiusY, currentScale), e.rotation, 0, Math.PI * 2);
      targetCtx.stroke();
    };

    /* 바닥 빛 영역: 가운데가 가장 밝고 바깥으로 갈수록 옅어진다 (광도 모델의 배광 곡선을 그대로 따름) */
    if (toggles.show_floor && floorField) {
      targetCtx.save();
      clipShutter(floorPolygons);
      drawLightPool(targetCtx, fix, floorField, currentScale, isSelected);
      targetCtx.restore();
    }

    /* 바닥 각도선: 빔(50%)과 필드(10%) 경계 */
    if (floorField && toggles.show_field) {
      targetCtx.save();
      clipShutter(floorPolygons);
      targetCtx.strokeStyle = isSelected ? "rgba(255, 255, 210, 0.85)" : "rgba(230, 230, 230, 0.55)";
      targetCtx.lineWidth = 1;
      targetCtx.setLineDash([6, 4]);
      strokeEllipse(floorField);
      targetCtx.restore();
    }
    if (floorBeam) {
      targetCtx.save();
      clipShutter(floorPolygons);
      targetCtx.strokeStyle = isSelected ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.6)";
      targetCtx.lineWidth = 2;
      strokeEllipse(floorBeam);
      targetCtx.restore();
    }

    /* 얼굴 높이 영역 */
    if (toggles.show_face && (faceField || faceBeam)) {
      targetCtx.save();
      if (hasShutters && fix.shutter_active) {
        targetCtx.beginPath();
        targetCtx.moveTo(toPx(facePolygons[0].x, currentScale), toPx(facePolygons[0].y, currentScale));
        for (let m = 1; m < 4; m++) targetCtx.lineTo(toPx(facePolygons[m].x, currentScale), toPx(facePolygons[m].y, currentScale));
        targetCtx.closePath();
        targetCtx.clip();
      }
      if (faceField) {
        targetCtx.beginPath();
        targetCtx.ellipse(toPx(faceField.cx, currentScale), toPx(faceField.cy, currentScale), toPx(faceField.radiusX, currentScale), toPx(faceField.radiusY, currentScale), faceField.rotation, 0, Math.PI * 2);
        targetCtx.fillStyle = isSelected ? "rgba(255, 150, 150, 0.25)" : "rgba(200, 100, 100, 0.15)";
        targetCtx.fill();
        targetCtx.strokeStyle = "rgba(255, 100, 100, 0.6)";
        targetCtx.lineWidth = 1;
        targetCtx.setLineDash([4, 4]);
        targetCtx.stroke();
      }
      if (faceBeam) {
        targetCtx.beginPath();
        targetCtx.ellipse(toPx(faceBeam.cx, currentScale), toPx(faceBeam.cy, currentScale), toPx(faceBeam.radiusX, currentScale), toPx(faceBeam.radiusY, currentScale), faceBeam.rotation, 0, Math.PI * 2);
        targetCtx.fillStyle = isSelected ? "rgba(255, 100, 100, 0.3)" : "rgba(200, 50, 50, 0.2)";
        targetCtx.fill();
        targetCtx.strokeStyle = "rgba(255, 50, 50, 0.9)";
        targetCtx.lineWidth = 2;
        targetCtx.setLineDash([4, 4]);
        targetCtx.stroke();
      }
      targetCtx.restore();
    }

    /* Markers */
    targetCtx.fillStyle = isSelected ? "#0d6efd" : "#6c757d";
    targetCtx.fillRect(toPx(fix.position.x, currentScale) - 8, toPx(fix.position.y, currentScale) - 8, 16, 16);
    if (fix.gel) {
      targetCtx.fillStyle = gelDisplayHex(fix.gel);
      targetCtx.beginPath();
      targetCtx.arc(toPx(fix.position.x, currentScale), toPx(fix.position.y, currentScale), 5, 0, Math.PI * 2);
      targetCtx.fill();
    }

    targetCtx.fillStyle = isSelected ? "yellow" : "#aaa";
    targetCtx.beginPath();
    targetCtx.arc(toPx(fix.target.x, currentScale), toPx(fix.target.y, currentScale), 5, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.stroke();

    if (isActiveFixture && hasShutters && fix.shutter_active) {
      targetCtx.fillStyle = "red";
      floorPolygons.forEach(p => {
        targetCtx.beginPath();
        targetCtx.arc(toPx(p.x, currentScale), toPx(p.y, currentScale), 5, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.strokeStyle = "white";
        targetCtx.lineWidth = 1;
        targetCtx.stroke();
      });
    }
    
    targetCtx.restore();
  });

  (actors ?? []).forEach(actor => {
    if (!actor.is_visible) return;
    targetCtx.save();
    targetCtx.translate(currentOffsetX, currentOffsetY);
    const px = toPx(actor.x, currentScale);
    const py = toPx(actor.y, currentScale);

    targetCtx.fillStyle = "rgba(45, 122, 82, 0.18)";
    targetCtx.strokeStyle = "#2d7a52";
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.arc(px, py, 9, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.stroke();

    targetCtx.beginPath();
    targetCtx.moveTo(px - 13, py);
    targetCtx.lineTo(px + 13, py);
    targetCtx.moveTo(px, py - 13);
    targetCtx.lineTo(px, py + 13);
    targetCtx.stroke();

    // 고른 사람 모형은 바깥 고리를 더 그린다
    if (actor.id === selectedActorId) {
      targetCtx.strokeStyle = "#ffd166";
      targetCtx.lineWidth = 2;
      targetCtx.beginPath();
      targetCtx.arc(px, py, 15, 0, Math.PI * 2);
      targetCtx.stroke();
    }

    // 배우 얼굴에 닿는 밝기를 늘 옆에 보여 준다 (사양 §4). 얼굴 높이는 이 사람의 키에서 정한다
    const brightness = GeometryEngine.calculateProbeBrightness(cue, stageConfig, actor, actorFaceHeight(actor));
    const text = `${actor.label} · 얼굴 ${Math.round(brightness.faceLux).toLocaleString('ko-KR')} lux`;
    targetCtx.font = '600 12px "IBM Plex Sans KR", "Segoe UI", sans-serif';
    const w = targetCtx.measureText(text).width + 14;
    targetCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
    targetCtx.strokeStyle = "#2d7a52";
    targetCtx.lineWidth = 1;
    targetCtx.beginPath();
    targetCtx.roundRect(px + 16, py - 11, w, 22, 6);
    targetCtx.fill();
    targetCtx.stroke();
    targetCtx.fillStyle = "#1f5c3d";
    targetCtx.fillText(text, px + 23, py + 4);
    targetCtx.restore();
  });
};

// [추가됨] 썸네일 생성 함수
export const generateThumbnail = (cue: Cue, stageConfig: StageConfig, toggles: UIToggles): string => {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 160;
  offCanvas.height = 160;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return '';

  // 본 화면과 같은 어두운 바탕이어야 빛(screen 합성)이 보인다
  offCtx.fillStyle = '#1f2329';
  offCtx.fillRect(0, 0, 160, 160);

  const sw = stageConfig.width;
  const sd = stageConfig.depth;
  const thumbScale = Math.min(offCanvas.width / sw, offCanvas.height / sd) * 0.85;
  const thumbOffsetX = (offCanvas.width - sw * thumbScale) / 2;
  const thumbOffsetY = (offCanvas.height - sd * thumbScale) / 2;

  // 썸네일에서는 선택 마커 하이라이트를 주지 않기 위해 selectedFixtureId 인자를 null로 넘김
  drawCueToContext(offCtx, cue, thumbScale, thumbOffsetX, thumbOffsetY, toggles, stageConfig, [], null, null);

  return offCanvas.toDataURL('image/jpeg', 0.5);
};

/**
 * 무대를 화면에 맞추는 기준. 떠 있는 도구 레일(왼쪽), 패널 트레이(오른쪽), 위쪽 버튼, 아래 씬 서랍에
 * 가려지지 않는 영역 안에 무대가 들어가도록 한다.
 */
const fitFrame = (scaleForOffset?: number) => {
  const w = canvas!.width;
  const h = canvas!.height;
  const wide = w >= 700;
  const inset = wide ? { l: 70, r: 200, t: 56, b: 64 } : { l: 8, r: 8, t: 56, b: 48 };
  const availW = Math.max(50, w - inset.l - inset.r);
  const availH = Math.max(50, h - inset.t - inset.b);
  const { width: sw, depth: sd } = getState().stage_config;
  const fitScale = Math.min(availW / sw, availH / sd) * 0.94;
  const s = scaleForOffset ?? fitScale * viewZoom;
  return {
    fitScale,
    baseX: inset.l + (availW - sw * s) / 2,
    baseY: inset.t + (availH - sd * s) / 2
  };
};

const zoomCanvasAt = (screenX: number, screenY: number, factor: number) => {
  if (!canvas) return;

  const worldBefore = toWorld(screenX, screenY);
  viewZoom = Math.min(6, Math.max(0.35, viewZoom * factor));

  const nextScale = fitFrame(0).fitScale * viewZoom;
  const { baseX: baseOffsetX, baseY: baseOffsetY } = fitFrame(nextScale);

  viewPanX = screenX - worldBefore.x * nextScale - baseOffsetX;
  viewPanY = screenY - worldBefore.y * nextScale - baseOffsetY;
  renderCanvas();
};

export const renderCanvas = () => {
  if (!canvas || !ctx || !canvasWrapper) return;

  const rect = canvasWrapper.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width = rect.width;
  canvas.height = rect.height;

  const state = getState();
  const sw = state.stage_config.width;
  const sd = state.stage_config.depth;

  scale = fitFrame(0).fitScale * viewZoom;
  const { baseX, baseY } = fitFrame(scale);
  offsetX = baseX + viewPanX;
  offsetY = baseY + viewPanY;
  viewListeners.forEach(listener => listener());

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#535353";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  state.stage_config.reference_layers
    .filter(layer => layer.is_visible)
    .forEach(layer => {
      drawImageLayer(ctx!, layer.image, layer.x, layer.y, layer.width, layer.height, layer.opacity, scale, offsetX, offsetY, layer.blend_mode);
    });

  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  for (let i = 0; i <= sw; i++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + toPx(i), offsetY);
    ctx.lineTo(offsetX + toPx(i), offsetY + toPx(sd));
    ctx.stroke();
  }
  for (let j = 0; j <= sd; j++) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + toPx(j));
    ctx.lineTo(offsetX + toPx(sw), offsetY + toPx(j));
    ctx.stroke();
  }

  drawSetPieces(ctx, state.stage_config.set_pieces ?? [], state.selected_set_id);
  const selectedSet = (state.stage_config.set_pieces ?? []).find(p => p.id === state.selected_set_id);
  if (selectedSet) {
    drawSetHandles(ctx, selectedSet);
    const mode = state.interaction.dragMode;
    if (mode === 'set-corner' || mode === 'set-rotate') drawSetDragReadout(ctx, selectedSet, mode);
  }

  // 세트 그리기 중인 사각형 미리보기
  const draft = getSetDraft();
  if (draft) {
    const x = offsetX + toPx(Math.min(draft.start.x, draft.end.x));
    const y = offsetY + toPx(Math.min(draft.start.y, draft.end.y));
    const w = toPx(Math.abs(draft.end.x - draft.start.x));
    const h = toPx(Math.abs(draft.end.y - draft.start.y));
    ctx.save();
    ctx.fillStyle = 'rgba(107, 90, 74, 0.45)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '12px "IBM Plex Sans KR", sans-serif';
    ctx.fillText(`${Math.abs(draft.end.x - draft.start.x).toFixed(2)} × ${Math.abs(draft.end.y - draft.start.y).toFixed(2)} m`, x + 4, y - 6);
    ctx.restore();
  }

  const currentCue = getCurrentCue();
  if (!currentCue) return;

  // 분리된 그리기 함수 호출
  drawCueToContext(ctx, currentCue, scale, offsetX, offsetY, state.ui_toggles, state.stage_config, state.selected_fixture_ids, state.selected_fixture_id, state.actors, state.selected_actor_id ?? null);
};

export const initCanvas = (canvasEl: HTMLCanvasElement, wrapperEl: HTMLElement) => {
  canvas = canvasEl;
  canvasWrapper = wrapperEl;
  ctx = canvas.getContext('2d');

  if (!canvas || !ctx) {
    console.error("Canvas 초기화 실패");
    return;
  }

  window.addEventListener('resize', () => {
    requestAnimationFrame(renderCanvas);
  });

  subscribe(renderCanvas);
  onToolRedraw(renderCanvas);

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;

    const rect = canvas!.getBoundingClientRect();
    const worldPos = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const state = getState();
    const cue = getCurrentCue();
    
    if (!cue) return;

    // 선택 도구가 아니면 놓기·그리기 도구가 이 누름을 처리한다
    if (toolPointerDown(worldPos)) return;

    const selectedFix = cue.fixtures.find(f => f.id === state.selected_fixture_id);
    // 끌기는 실제로 움직였을 때만 실행 취소 기록을 남긴다 (그냥 누르기만 하면 기록하지 않음)
    const startDrag = (mode: 'position' | 'target' | 'shutter' | 'probe' | 'set' | 'set-corner' | 'set-rotate', index = -1) => {
      dragHistoryPending = true;
      setState(s => { s.interaction.dragMode = mode; s.interaction.draggedIndex = index; });
      canvas!.classList.add('grabbing');
    };

    // 0) 선택한 세트의 손잡이: 꼭짓점(크기), 노란 원(회전)
    const selectedSet = (state.stage_config.set_pieces ?? []).find(p => p.id === state.selected_set_id);
    if (selectedSet) {
      const hit = hitSetHandle(selectedSet, worldPos);
      if (hit?.kind === 'rotate') { startDrag('set-rotate'); return; }
      if (hit?.kind === 'corner') {
        setFixedCorner = setPieceCorners(selectedSet)[(hit.index + 2) % 4];
        startDrag('set-corner', hit.index);
        return;
      }
    }

    // 1) 선택한 조명의 손잡이: 조준점, 셔터 꼭짓점
    if (selectedFix && selectedFix.is_visible !== false) {
      if (Math.hypot(worldPos.x - selectedFix.target.x, worldPos.y - selectedFix.target.y) < 0.5) {
        startDrag('target');
        return;
      }
      if (GeometryEngine.fixtureHasShutters(selectedFix) && selectedFix.shutter_active) {
        for (let i = 0; i < 4; i++) {
          const absX = selectedFix.target.x + selectedFix.shutter_polygon[i].dx;
          const absY = selectedFix.target.y + selectedFix.shutter_polygon[i].dy;
          if (Math.hypot(worldPos.x - absX, worldPos.y - absY) < 0.5) {
            startDrag('shutter', i);
            return;
          }
        }
      }
    }

    // 2) 조명: 누르면 고르고, 그대로 끌면 옮긴다 (여러 개 동시 선택은 없다)
    for (let j = cue.fixtures.length - 1; j >= 0; j--) {
      const fix = cue.fixtures[j];
      if (fix.is_visible === false) continue;
      if (Math.hypot(worldPos.x - fix.position.x, worldPos.y - fix.position.y) < 0.6) {
        selectFixture(fix.id);
        moveStart = { kind: 'fixture', id: fix.id, from: { x: fix.position.x, y: fix.position.y } };
        startDrag('position');
        return;
      }
    }

    // 3) 사람 모형 (위에 그려진 것부터)
    for (let a = state.actors.length - 1; a >= 0; a--) {
      const actor = state.actors[a];
      if (!actor.is_visible || Math.hypot(worldPos.x - actor.x, worldPos.y - actor.y) >= 0.6) continue;
      selectActor(actor.id);
      moveStart = { kind: 'actor', id: actor.id, from: { x: actor.x, y: actor.y } };
      startDrag('probe');
      return;
    }

    // 4) 세트 (위에 그려진 것부터)
    const pieces = state.stage_config.set_pieces ?? [];
    for (let k = pieces.length - 1; k >= 0; k--) {
      const piece = pieces[k];
      if (!pointInSetPiece(worldPos, piece)) continue;
      setDragOffset = { x: worldPos.x - piece.x, y: worldPos.y - piece.y };
      selectSet(piece.id);
      moveStart = { kind: 'set', id: piece.id, from: { x: piece.x, y: piece.y } };
      startDrag('set');
      return;
    }

    // 5) 빈 바닥: 선택을 풀고, 끌면 화면이 움직인다
    clearSelection();
    isViewPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    canvas!.classList.add('grabbing');
  });

  canvas.addEventListener('mouseleave', () => reportPointer(null));
  // 더블클릭: 첫 번째 누름으로 고른 것의 패널을 연다 (자동으로 열지 않기 설정과 상관없이)
  canvas.addEventListener('dblclick', () => {
    if (getTool() === 'select') openSelected();
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    {
      const rect = canvas!.getBoundingClientRect();
      reportPointer(toWorld(e.clientX - rect.left, e.clientY - rect.top));
      if (toolPointerMove(toWorld(e.clientX - rect.left, e.clientY - rect.top))) {
        canvas!.style.cursor = ''; // 놓기 도구의 십자 커서가 보이게 손잡이 커서를 지운다
        return;
      }
    }
    if (isViewPanning) {
      if ((e.buttons & 1) === 0) {
        isViewPanning = false;
        lastViewPanEndAt = performance.now();
        canvas!.classList.remove('grabbing');
        return;
      }

      viewPanX += e.clientX - lastPanX;
      viewPanY += e.clientY - lastPanY;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      renderCanvas();
      return;
    }

    const state = getState();
    const { dragMode, draggedIndex } = state.interaction;
    if (!dragMode) {
      updateHoverCursor(e);
      return;
    }
    if (dragHistoryPending) {
      commitHistory();
      dragHistoryPending = false;
    }

    const rect = canvas!.getBoundingClientRect();
    const worldPos = toWorld(e.clientX - rect.left, e.clientY - rect.top);

    setState(s => {
      if (dragMode === 'probe') {
        const actor = s.actors.find(a => a.id === s.selected_actor_id);
        if (actor) {
          actor.x = Math.min(s.stage_config.width, Math.max(0, worldPos.x));
          actor.y = Math.min(s.stage_config.depth, Math.max(0, worldPos.y));
        }
        return;
      }

      if (dragMode === 'set-corner' || dragMode === 'set-rotate') {
        const piece = (s.stage_config.set_pieces ?? []).find(item => item.id === s.selected_set_id);
        if (!piece) return;
        if (dragMode === 'set-rotate') {
          // 손잡이가 마우스 쪽을 가리키는 각도: 지역 (0, -1) 방향을 돌린 결과가 (sin θ, -cos θ)
          const deg = Math.atan2(worldPos.x - piece.x, -(worldPos.y - piece.y)) * 180 / Math.PI;
          piece.rotation = snapRotation(deg);
          return;
        }
        // 반대쪽 꼭짓점을 고정하고, 마우스까지의 벡터를 세트의 지역 축으로 나눠 크기를 정한다
        const r = piece.rotation * Math.PI / 180;
        const dx = worldPos.x - setFixedCorner.x;
        const dy = worldPos.y - setFixedCorner.y;
        const lx = dx * Math.cos(r) + dy * Math.sin(r);
        const ly = -dx * Math.sin(r) + dy * Math.cos(r);
        const round = (v: number) => Math.round(v * 100) / 100; // 10 mm 단위
        const w = Math.max(MIN_SET_SIZE, round(Math.abs(lx)));
        const d = Math.max(MIN_SET_SIZE, round(Math.abs(ly)));
        const hx = (lx < 0 ? -w : w) / 2;
        const hy = (ly < 0 ? -d : d) / 2;
        piece.width = w;
        piece.depth = d;
        piece.x = Number((setFixedCorner.x + hx * Math.cos(r) - hy * Math.sin(r)).toFixed(3));
        piece.y = Number((setFixedCorner.y + hx * Math.sin(r) + hy * Math.cos(r)).toFixed(3));
        return;
      }

      if (dragMode === 'set') {
        const piece = (s.stage_config.set_pieces ?? []).find(item => item.id === s.selected_set_id);
        if (piece) {
          piece.x = Number((worldPos.x - setDragOffset.x).toFixed(2));
          piece.y = Number((worldPos.y - setDragOffset.y).toFixed(2));
        }
        return;
      }

      const activeCue = s.cues[s.active_cue_index];
      const fix = activeCue?.fixtures.find(f => f.id === s.selected_fixture_id);
      
      if (!fix || fix.is_visible === false) return;

      if (dragMode === 'position') {
        fix.position.x = worldPos.x;
        fix.position.y = worldPos.y;
      } else if (dragMode === 'target') {
        fix.target.x = worldPos.x;
        fix.target.y = worldPos.y;
      } else if (dragMode === 'shutter' && GeometryEngine.fixtureHasShutters(fix)) {
        fix.shutter_polygon[draggedIndex].dx = worldPos.x - fix.target.x;
        fix.shutter_polygon[draggedIndex].dy = worldPos.y - fix.target.y;
      }
    });

    if (moveStart && (dragMode === 'position' || dragMode === 'probe' || dragMode === 'set')) {
      const now = getState();
      const to = moveStart.kind === 'actor' ? now.actors.find(a => a.id === moveStart!.id)
        : moveStart.kind === 'set' ? (now.stage_config.set_pieces ?? []).find(p => p.id === moveStart!.id)
          : now.cues[now.active_cue_index]?.fixtures.find(f => f.id === moveStart!.id)?.position;
      if (to) reportMove(moveStart.kind, moveStart.id, moveStart.from, { x: to.x, y: to.y });
    }
  });

  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    if (isViewPanning || performance.now() - lastViewPanEndAt < 180) return;

    const rect = canvas!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    zoomCanvasAt(screenX, screenY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (toolPointerUp(toWorld(e.clientX - rect.left, e.clientY - rect.top))) return;
    }
    const state = getState();
    dragHistoryPending = false;
    if (state.interaction.dragMode !== null) {
      setState(s => { s.interaction.dragMode = null; });
      canvas!.classList.remove('grabbing');
    }
    if (isViewPanning) {
      isViewPanning = false;
      lastViewPanEndAt = performance.now();
      canvas!.classList.remove('grabbing');
    }
  });

  renderCanvas();
};

export const zoomCanvas = (factor: number) => {
  if (!canvas) return;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  zoomCanvasAt(centerX, centerY, factor);
};

export const resetCanvasZoom = () => {
  viewZoom = 1;
  viewPanX = 0;
  viewPanY = 0;
  renderCanvas();
};
