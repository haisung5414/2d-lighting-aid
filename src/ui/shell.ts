// src/ui/shell.ts
// SketchUp Web식 화면 골격의 동작: 파일 메뉴, 2D/3D 전환, 실행 취소 버튼, 패널 트레이(한 번에 하나), 씬 서랍, 확대 비율.
// 각 패널 안의 내용은 기존 UI 모듈(fixture, probe, patch, scene, sets, manager)이 그대로 그린다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §2, §5.4, §6, §7, §8

import './shell.css';
import { getState, subscribe, undo, redo } from '../state/store';
import { getViewZoom, onViewChange, resetCanvasZoom, zoomCanvas } from '../render/canvas';
import { initTools, onObjectPlaced, setToolsViewMode } from './tools';

let openPanelId: string | null = null;
let sceneDrawerOpen = false;
let view3DOn = false;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

/* ---------- 패널 트레이: 한 번에 하나만 연다 ---------- */

const renderPanels = () => {
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => {
    panel.hidden = panel.dataset.panel !== openPanelId;
  });
  document.querySelectorAll<HTMLElement>('[data-tray]').forEach(button => {
    button.setAttribute('aria-expanded', String(button.dataset.tray === openPanelId));
  });
};

export const openPanel = (id: string | null) => {
  openPanelId = id;
  renderPanels();
};

const initTray = () => {
  document.querySelectorAll<HTMLElement>('[data-tray]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.tray ?? null;
      openPanel(openPanelId === id ? null : id);
    });
  });
  document.querySelectorAll<HTMLElement>('[data-close-panel]').forEach(button => {
    button.addEventListener('click', () => openPanel(null));
  });
  renderPanels();
};

/* ---------- 파일 알약 ---------- */

const closeFileMenu = () => {
  const menu = $('file-menu');
  if (menu) menu.hidden = true;
  $('file-menu-btn')?.setAttribute('aria-expanded', 'false');
};

const showLanding = () => {
  const landing = $('landing-screen');
  const editor = $('editor-screen');
  if (landing) landing.style.display = '';
  if (editor) editor.style.display = 'none';
};

const initFilePill = () => {
  const menuButton = $('file-menu-btn');
  const menu = $('file-menu');
  menuButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu) return;
    menu.hidden = !menu.hidden;
    menuButton.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.menu-wrap')) closeFileMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFileMenu(); });

  menu?.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach(item => {
    item.addEventListener('click', () => {
      closeFileMenu();
      const action = item.dataset.menu;
      if (action === 'load') $('file-upload')?.click();
      if (action === 'save') (window as any).saveFile?.();
      if (action === 'workspace' && window.confirm('저장하지 않은 작업은 사라집니다. 작업 공간 선택 화면으로 돌아갈까요?')) {
        if (view3DOn) void setViewMode('2d');
        showLanding();
      }
    });
  });

  $('undo-btn')?.addEventListener('click', () => undo());
  $('redo-btn')?.addEventListener('click', () => redo());

  // manager.ts가 저장·불러오기 때 파일 이름을 알려 준다
  window.addEventListener('lighting:file', (e) => {
    const name = (e as CustomEvent<{ name: string }>).detail?.name;
    const label = $('file-name');
    if (label && name) label.textContent = name.replace(/\.json$/i, '');
  });
};

/* ---------- 2D / 3D 전환 ---------- */

export const setViewMode = async (mode: '2d' | '3d') => {
  const on = mode === '3d';
  if (on === view3DOn) return;
  const wrapper = $('canvas-wrapper');
  const canvas = $<HTMLCanvasElement>('stageCanvas');
  if (!wrapper || !canvas) return;

  // three.js는 처음 3D를 켤 때만 불러온다
  const { setView3DActive } = await import('../render/view3d');
  view3DOn = on;
  canvas.style.display = on ? 'none' : 'block';
  setView3DActive(wrapper, on);
  // "3D 극장 구조" 패널은 3D 보기일 때만 누를 수 있다
  const venue3dButton = document.querySelector<HTMLButtonElement>('[data-tray="venue3d"]');
  if (venue3dButton) venue3dButton.disabled = !on;
  if (!on && openPanelId === 'venue3d') openPanel(null);
  setToolsViewMode(on);
  $('view-2d')?.setAttribute('aria-pressed', String(!on));
  $('view-3d')?.setAttribute('aria-pressed', String(on));
  if (!on) window.dispatchEvent(new Event('resize'));
};

const initVenue3DPanel = () => {
  document.querySelectorAll<HTMLInputElement>('[data-venue3d]').forEach(input => {
    input.addEventListener('change', async () => {
      const { setVenueLayer3D } = await import('../render/view3d');
      setVenueLayer3D(input.dataset.venue3d as 'venue' | 'catwalk' | 'seating' | 'worklight', input.checked);
    });
  });
};

const initViewSwitch = () => {
  $('view-2d')?.addEventListener('click', () => void setViewMode('2d'));
  $('view-3d')?.addEventListener('click', () => void setViewMode('3d'));
  // 예전 코드와 시험 스크립트가 쓰던 전역 함수
  (window as any).toggleView3D = () => setViewMode(view3DOn ? '2d' : '3d');
};

/* ---------- 씬 서랍 ---------- */

const renderSceneHandle = () => {
  const state = getState();
  const cue = state.cues[state.active_cue_index];
  const current = $('scene-current');
  const meta = $('scene-meta');
  if (current) current.textContent = cue?.label ?? '';
  if (meta) meta.textContent = `${state.cues.length}개 · ${sceneDrawerOpen ? '누르면 닫힘' : '누르면 목록이 올라옴'}`;
};

const initSceneDrawer = () => {
  const handle = $('scene-handle');
  const body = $('scene-body');
  handle?.addEventListener('click', () => {
    sceneDrawerOpen = !sceneDrawerOpen;
    if (body) body.hidden = !sceneDrawerOpen;
    handle.setAttribute('aria-expanded', String(sceneDrawerOpen));
    $('scene-drawer')?.classList.toggle('open', sceneDrawerOpen);
    renderSceneHandle();
  });
  subscribe(renderSceneHandle);
  renderSceneHandle();
};

/* ---------- 상태 바: 확대 비율 ---------- */

const renderZoom = () => {
  const label = $('zoom-fit');
  if (label) label.textContent = `${Math.round(getViewZoom() * 100)}%`;
};

const initZoom = () => {
  $('zoom-in')?.addEventListener('click', () => zoomCanvas(1.2));
  $('zoom-out')?.addEventListener('click', () => zoomCanvas(1 / 1.2));
  $('zoom-fit')?.addEventListener('click', () => resetCanvasZoom());
  onViewChange(renderZoom);
  renderZoom();
};

export const initShell = () => {
  initTray();
  initTools();
  // 놓은 직후 그 대상의 패널을 연다 (임시: 세트 속성은 아직 "무대 위 목록" 안에 있다 — Phase 3에서 정리)
  onObjectPlaced(kind => openPanel(kind === 'fixture' ? 'props' : 'list'));
  initFilePill();
  initViewSwitch();
  initVenue3DPanel();
  initSceneDrawer();
  initZoom();
};
