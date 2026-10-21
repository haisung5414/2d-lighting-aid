// src/main.ts
import './style.css';
import { initCanvas } from './render/canvas';
import { initManagerUI } from './ui/manager';
import { initSceneUI } from './ui/scene';
import { initPatchUI } from './ui/patch';
import { initLightSettings } from './ui/lightSettings';
import { initProperties } from './ui/properties';
import { initStageList } from './ui/stageList';
import { initShell } from './ui/shell';
import { initStatusBar } from './ui/statusbar';
import { initHelp } from './ui/help';
import { initCloud } from './cloud';
import { initTutorial } from './tutorial';
import { undo, redo } from './state/store';

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.setProperty(
    '--landing-bg-image',
    `url("${import.meta.env.BASE_URL}venues/humanities/humanities_floor_plan.png")`
  );

  const canvasEl = document.getElementById('stageCanvas') as HTMLCanvasElement;
  const wrapperEl = document.getElementById('canvas-wrapper') as HTMLElement;

  if (canvasEl && wrapperEl) {
    initCanvas(canvasEl, wrapperEl);
    initManagerUI();
    initSceneUI();
    initPatchUI();
    initLightSettings();
    initProperties();
    initStageList();
    initStatusBar();
    initHelp();
    initShell();
    initCloud();
    initTutorial();
    
    console.log("애플리케이션 초기화 완료");
  } else {
    console.error("필수 DOM 요소를 찾을 수 없습니다.");
  }
});



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
