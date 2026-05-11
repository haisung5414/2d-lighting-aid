// src/render/canvas.ts

import { getState, setState, getCurrentCue, subscribe, commitHistory } from '../state/store';
import { GeometryEngine } from '../engine/geometry';
import type { Position2D, Cue, UIToggles, StageConfig } from '../types';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let canvasWrapper: HTMLElement | null = null;
let scale = 1;
let offsetX = 0;
let offsetY = 0;

const imageCache = new Map<string, HTMLImageElement>();

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
  currentOffsetY: number
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
  selectedFixtureId: string | null = null
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

    const isSelected = (fix.id === selectedFixtureId);
    
    const floorPolygons = fix.shutter_polygon.map(p => ({
      x: fix.target.x + p.dx,
      y: fix.target.y + p.dy
    }));
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
      if (fix.shutter_active) {
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
        targetCtx.filter = `blur(${fix.edge_softness}px)`;
        targetCtx.strokeStyle = isSelected ? "rgba(255, 255, 200, 0.6)" : "rgba(200, 200, 200, 0.4)";
        targetCtx.lineWidth = 1;
        targetCtx.stroke();
        targetCtx.filter = "none";
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
      if (fix.shutter_active) {
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
    
    targetCtx.fillStyle = isSelected ? "yellow" : "#aaa";
    targetCtx.beginPath();
    targetCtx.arc(toPx(fix.target.x, currentScale), toPx(fix.target.y, currentScale), 5, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.stroke();

    if (isSelected && fix.shutter_active) {
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
};

// [추가됨] 썸네일 생성 함수
export const generateThumbnail = (cue: Cue, stageConfig: StageConfig, toggles: UIToggles): string => {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 160;
  offCanvas.height = 160;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return '';

  offCtx.fillStyle = '#222';
  offCtx.fillRect(0, 0, 160, 160);

  const sw = stageConfig.width;
  const sd = stageConfig.depth;
  const thumbScale = Math.min(offCanvas.width / sw, offCanvas.height / sd) * 0.85;
  const thumbOffsetX = (offCanvas.width - sw * thumbScale) / 2;
  const thumbOffsetY = (offCanvas.height - sd * thumbScale) / 2;

  // 썸네일에서는 선택 마커 하이라이트를 주지 않기 위해 selectedFixtureId 인자를 null로 넘김
  drawCueToContext(offCtx, cue, thumbScale, thumbOffsetX, thumbOffsetY, toggles, stageConfig, null);

  return offCanvas.toDataURL('image/jpeg', 0.5);
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

  scale = Math.min(canvas.width / sw, canvas.height / sd) * 0.85;
  offsetX = (canvas.width - sw * scale) / 2;
  offsetY = (canvas.height - sd * scale) / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  state.stage_config.reference_layers
    .filter(layer => layer.is_visible)
    .forEach(layer => {
      drawImageLayer(ctx!, layer.image, layer.x, layer.y, layer.width, layer.height, layer.opacity, scale, offsetX, offsetY);
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

  const currentCue = getCurrentCue();
  if (!currentCue) return;

  // 분리된 그리기 함수 호출
  drawCueToContext(ctx, currentCue, scale, offsetX, offsetY, state.ui_toggles, state.stage_config, state.selected_fixture_id);
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
    const rect = canvas!.getBoundingClientRect();
    const worldPos = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const state = getState();
    const cue = getCurrentCue();
    
    if (!cue) return;

    const selectedFix = cue.fixtures.find(f => f.id === state.selected_fixture_id);
    
    if (selectedFix && selectedFix.is_visible !== false) {
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
      if (selectedFix.shutter_active) {
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
        setState(s => { s.selected_fixture_id = fix.id; });
        return;
      }
    }
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const state = getState();
    const { dragMode, draggedIndex } = state.interaction;
    if (!dragMode) return;

    const rect = canvas!.getBoundingClientRect();
    const worldPos = toWorld(e.clientX - rect.left, e.clientY - rect.top);

    setState(s => {
      const activeCue = s.cues[s.active_cue_index];
      const fix = activeCue?.fixtures.find(f => f.id === s.selected_fixture_id);
      
      if (!fix || fix.is_visible === false) return;

      if (dragMode === 'position') {
        fix.position.x = worldPos.x;
        fix.position.y = worldPos.y;
      } else if (dragMode === 'target') {
        fix.target.x = worldPos.x;
        fix.target.y = worldPos.y;
      } else if (dragMode === 'shutter') {
        fix.shutter_polygon[draggedIndex].dx = worldPos.x - fix.target.x;
        fix.shutter_polygon[draggedIndex].dy = worldPos.y - fix.target.y;
      }
    });
  });

  window.addEventListener('mouseup', () => {
    const state = getState();
    if (state.interaction.dragMode !== null) {
      setState(s => { s.interaction.dragMode = null; });
      canvas!.classList.remove('grabbing');
    }
  });

  renderCanvas();
};
