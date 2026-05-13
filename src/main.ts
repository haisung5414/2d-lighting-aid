// src/main.ts
import './style.css';
import { initCanvas, resetCanvasZoom, zoomCanvas } from './render/canvas';
import { initManagerUI } from './ui/manager';
import { initSceneUI } from './ui/scene';
import { initFixtureUI } from './ui/fixture';
import { initPatchUI } from './ui/patch';
import { undo, redo } from './state/store';

document.addEventListener('DOMContentLoaded', () => {
  const canvasEl = document.getElementById('stageCanvas') as HTMLCanvasElement;
  const wrapperEl = document.getElementById('canvas-wrapper') as HTMLElement;

  if (canvasEl && wrapperEl) {
    initCanvas(canvasEl, wrapperEl);
    initManagerUI();
    initSceneUI();
    initFixtureUI();
    initPatchUI();
    
    console.log("✅ 애플리케이션 초기화 완료");
  } else {
    console.error("🚨 필수 DOM 요소를 찾을 수 없습니다.");
  }
});

(window as any).zoomCanvas = zoomCanvas;
(window as any).resetCanvasZoom = resetCanvasZoom;

// 글로벌 단축키 등록 (Undo/Redo)
window.addEventListener('keydown', (e: KeyboardEvent) => {
  // Mac은 metaKey(Cmd), Windows/Linux는 ctrlKey
  const isCmdOrCtrl = e.metaKey || e.ctrlKey;

  if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) {
      // Cmd/Ctrl + Shift + Z : Redo
      e.preventDefault();
      redo();
    } else {
      // Cmd/Ctrl + Z : Undo
      e.preventDefault();
      undo();
    }
  } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
    // Cmd/Ctrl + Y : Redo (Windows 스타일)
    e.preventDefault();
    redo();
  }
});
