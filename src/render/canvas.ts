// src/render/canvas.ts

import { getState, setState, getCurrentCue, subscribe, commitHistory } from '../state/store';
import { GeometryEngine } from '../engine/geometry';
import { gelDisplayHex } from '../engine/gels';
import type { Position2D, Cue, UIToggles, StageConfig, ProbeState, SetPiece } from '../types';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let canvasWrapper: HTMLElement | null = null;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let viewZoom = 1;
let viewPanX = 0;
let viewPanY = 0;
let isViewPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let lastViewPanEndAt = 0;

const imageCache = new Map<string, HTMLImageElement>();
/** 세트를 끌 때 클릭한 지점과 세트 중심 사이의 거리 */
let setDragOffset: Position2D = { x: 0, y: 0 };

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
  probe: ProbeState | null = null
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

    const floorField = toggles.show_field ? GeometryEngine.calculateEllipse(fix, 0, 'field') : null;
    const floorBeam = toggles.show_beam ? GeometryEngine.calculateEllipse(fix, 0, 'beam') : null;
    const faceField = toggles.show_field ? GeometryEngine.calculateEllipse(fix, actorH, 'field') : null;
    const faceBeam = toggles.show_beam ? GeometryEngine.calculateEllipse(fix, actorH, 'beam') : null;

    targetCtx.save();
    targetCtx.translate(currentOffsetX, currentOffsetY);

    /* Floor Render */
    if (toggles.show_floor && (floorField || floorBeam)) {
      targetCtx.save();
      if (hasShutters && fix.shutter_active) {
        targetCtx.beginPath();
        targetCtx.moveTo(toPx(floorPolygons[0].x, currentScale), toPx(floorPolygons[0].y, currentScale));
        for (let k = 1; k < 4; k++) targetCtx.lineTo(toPx(floorPolygons[k].x, currentScale), toPx(floorPolygons[k].y, currentScale));
        targetCtx.closePath();
        targetCtx.clip();
      }
      if (floorField) {
        targetCtx.beginPath();
        targetCtx.ellipse(toPx(floorField.cx, currentScale), toPx(floorField.cy, currentScale), toPx(floorField.radiusX, currentScale), toPx(floorField.radiusY, currentScale), floorField.rotation, 0, Math.PI * 2);
        targetCtx.fillStyle = isSelected ? "rgba(255, 255, 180, 0.2)" : "rgba(200, 200, 200, 0.1)";
        targetCtx.fill();
        targetCtx.strokeStyle = isSelected ? "rgba(255, 255, 200, 0.6)" : "rgba(200, 200, 200, 0.4)";
        targetCtx.lineWidth = 1;
        targetCtx.stroke();
      }
      if (floorBeam) {
        targetCtx.beginPath();
        targetCtx.ellipse(toPx(floorBeam.cx, currentScale), toPx(floorBeam.cy, currentScale), toPx(floorBeam.radiusX, currentScale), toPx(floorBeam.radiusY, currentScale), floorBeam.rotation, 0, Math.PI * 2);
        targetCtx.fillStyle = isSelected ? "rgba(255, 255, 200, 0.4)" : "rgba(200, 200, 200, 0.2)";
        targetCtx.fill();
        targetCtx.strokeStyle = isSelected ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.4)";
        targetCtx.lineWidth = 2;
        targetCtx.stroke();
      }
      targetCtx.restore();
    }

    /* Face Render */
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

  if (probe?.is_visible) {
    targetCtx.save();
    targetCtx.translate(currentOffsetX, currentOffsetY);
    const px = toPx(probe.x, currentScale);
    const py = toPx(probe.y, currentScale);

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

    targetCtx.fillStyle = "#ffffff";
    targetCtx.font = "12px Segoe UI, sans-serif";
    targetCtx.fillText("Probe", px + 12, py - 10);
    targetCtx.restore();
  }
};

// [추가됨] 썸네일 생성 함수
export const generateThumbnail = (cue: Cue, stageConfig: StageConfig, toggles: UIToggles): string => {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 160;
  offCanvas.height = 160;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return '';

  offCtx.fillStyle = '#bbbbbb';
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

const zoomCanvasAt = (screenX: number, screenY: number, factor: number) => {
  if (!canvas) return;

  const worldBefore = toWorld(screenX, screenY);
  viewZoom = Math.min(6, Math.max(0.35, viewZoom * factor));

  const state = getState();
  const fitScale = Math.min(canvas.width / state.stage_config.width, canvas.height / state.stage_config.depth) * 0.85;
  const nextScale = fitScale * viewZoom;
  const baseOffsetX = (canvas.width - state.stage_config.width * nextScale) / 2;
  const baseOffsetY = (canvas.height - state.stage_config.depth * nextScale) / 2;

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

  const fitScale = Math.min(canvas.width / sw, canvas.height / sd) * 0.85;
  scale = fitScale * viewZoom;
  offsetX = (canvas.width - sw * scale) / 2 + viewPanX;
  offsetY = (canvas.height - sd * scale) / 2 + viewPanY;

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

  const currentCue = getCurrentCue();
  if (!currentCue) return;

  // 분리된 그리기 함수 호출
  drawCueToContext(ctx, currentCue, scale, offsetX, offsetY, state.ui_toggles, state.stage_config, state.selected_fixture_ids, state.selected_fixture_id, state.probe);
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

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;

    const rect = canvas!.getBoundingClientRect();
    const worldPos = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const state = getState();
    const cue = getCurrentCue();
    
    if (!cue) return;

    const selectedFix = cue.fixtures.find(f => f.id === state.selected_fixture_id);

    if (state.probe?.is_visible && Math.hypot(worldPos.x - state.probe.x, worldPos.y - state.probe.y) < 0.6) {
      commitHistory();
      setState(s => { s.interaction.dragMode = 'probe'; });
      canvas!.classList.add('grabbing');
      return;
    }
    
    if (selectedFix && selectedFix.is_visible !== false && !e.ctrlKey && !e.metaKey) {
      if (Math.hypot(worldPos.x - selectedFix.position.x, worldPos.y - selectedFix.position.y) < 0.6) {
        commitHistory();
        setState(s => { s.interaction.dragMode = 'position'; });
        canvas!.classList.add('grabbing');
        return;
      }
      if (Math.hypot(worldPos.x - selectedFix.target.x, worldPos.y - selectedFix.target.y) < 0.6) {
        commitHistory();
        setState(s => { s.interaction.dragMode = 'target'; });
        canvas!.classList.add('grabbing');
        return;
      }
      if (GeometryEngine.fixtureHasShutters(selectedFix) && selectedFix.shutter_active) {
        for (let i = 0; i < 4; i++) {
          const absX = selectedFix.target.x + selectedFix.shutter_polygon[i].dx;
          const absY = selectedFix.target.y + selectedFix.shutter_polygon[i].dy;
          if (Math.hypot(worldPos.x - absX, worldPos.y - absY) < 0.6) {
            commitHistory();
            setState(s => { 
              s.interaction.dragMode = 'shutter'; 
              s.interaction.draggedIndex = i; 
            });
            canvas!.classList.add('grabbing');
            return;
          }
        }
      }
    }

    for (let j = 0; j < cue.fixtures.length; j++) {
      const fix = cue.fixtures[j];
      if (fix.is_visible === false) continue;
      if (Math.hypot(worldPos.x - fix.position.x, worldPos.y - fix.position.y) < 0.8) {
        setState(s => {
          if (e.ctrlKey || e.metaKey) {
            if (s.selected_fixture_ids.includes(fix.id)) {
              s.selected_fixture_ids = s.selected_fixture_ids.filter(id => id !== fix.id);
              if (s.selected_fixture_id === fix.id) {
                s.selected_fixture_id = s.selected_fixture_ids[0] ?? null;
              }
            } else {
              s.selected_fixture_ids.push(fix.id);
              s.selected_fixture_id = fix.id;
            }
          } else {
            s.selected_fixture_id = fix.id;
            s.selected_fixture_ids = [fix.id];
          }
        });
        return;
      }
    }

    // 조명이 아닌 곳을 누르면 세트를 고르고 끌 수 있다 (위에 그려진 세트부터 확인)
    const pieces = state.stage_config.set_pieces ?? [];
    for (let k = pieces.length - 1; k >= 0; k--) {
      const piece = pieces[k];
      if (!pointInSetPiece(worldPos, piece)) continue;
      commitHistory();
      setDragOffset = { x: worldPos.x - piece.x, y: worldPos.y - piece.y };
      setState(s => {
        s.selected_set_id = piece.id;
        s.interaction.dragMode = 'set';
      });
      canvas!.classList.add('grabbing');
      return;
    }

    isViewPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    canvas!.classList.add('grabbing');
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
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
    if (!dragMode) return;

    const rect = canvas!.getBoundingClientRect();
    const worldPos = toWorld(e.clientX - rect.left, e.clientY - rect.top);

    setState(s => {
      if (dragMode === 'probe') {
        s.probe.x = Math.min(s.stage_config.width, Math.max(0, worldPos.x));
        s.probe.y = Math.min(s.stage_config.depth, Math.max(0, worldPos.y));
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
  });

  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    if (isViewPanning || performance.now() - lastViewPanEndAt < 180) return;

    const rect = canvas!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    zoomCanvasAt(screenX, screenY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  window.addEventListener('mouseup', () => {
    const state = getState();
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
