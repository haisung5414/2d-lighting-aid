// src/ui/shell.ts
// SketchUp Web식 화면 골격의 동작: 파일 메뉴, 2D/3D 전환, 실행 취소 버튼, 패널 트레이(아코디언, 한 번에 하나),
// 조명 설정 패널 여닫기, 씬 서랍, 확대 비율.
// 패널 안의 내용은 lightSettings / properties / stageList / patch / scene / manager 모듈이 그린다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §2, §5.2, §5.4, §5.6, §6, §7, §8

import './shell.css';
import { getState, onEdit, subscribe, undo, redo } from '../state/store';
import { saveProject } from './manager';
import { getViewZoom, onViewChange, resetCanvasZoom, zoomCanvas } from '../render/canvas';
import { initTools, setToolsViewMode } from './tools';
import { getSelectionKind, onSelect } from './selection';

let openPanelId: string | null = null;
/** 조명 설정 패널: 조명을 고를 때마다 트레이 맨 위에서 펼쳐진다 */
let lightSettingsOpen = false;
const AUTO_OPEN_3D_KEY = 'lightingAid.venue3dNoAutoOpen';
const AUTO_OPEN_PROPS_KEY = 'lightingAid.propsNoAutoOpen';
let sceneDrawerOpen = false;
let view3DOn = false;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

/* ---------- 패널 트레이: 한 번에 하나만 연다 ---------- */

const renderPanels = () => {
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => {
    panel.hidden = panel.dataset.panel !== openPanelId;
  });
  const settings = $('light-settings');
  if (settings) settings.hidden = !lightSettingsOpen || !getState().selected_fixture_id;
  document.querySelectorAll<HTMLElement>('[data-tray]').forEach(button => {
    button.setAttribute('aria-expanded', String(button.dataset.tray === openPanelId));
  });
  // 무언가 골라 두었으면 패널이 닫혀 있어도 "선택한 객체 속성" 아이콘에 색을 입힌다
  document.querySelector('[data-tray="props"]')?.classList.toggle('has-selection', getSelectionKind() !== null);
};

/** 트레이 패널을 연다. 패널이 겹치지 않도록 조명 설정은 접는다 */
export const openPanel = (id: string | null) => {
  openPanelId = id;
  if (id) lightSettingsOpen = false;
  renderPanels();
};

/** 조명 설정을 펼친다. 트레이에서 열어 둔 패널은 닫는다 (사양 §5.4) */
const openLightSettings = () => {
  const settings = $('light-settings');
  const wasHidden = settings?.hidden ?? true;
  lightSettingsOpen = true;
  openPanelId = null;
  renderPanels();
  // 내려오는 움직임은 새로 나타날 때만 보여 준다
  if (settings && wasHidden) {
    settings.classList.remove('drop');
    void settings.offsetWidth;
    settings.classList.add('drop');
  }
  $('tray')?.scrollTo({ top: 0 });
};

const initTray = () => {
  document.querySelectorAll<HTMLElement>('[data-tray]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.tray ?? null;
      openPanel(openPanelId === id ? null : id);
    });
  });
  $('light-settings-close')?.addEventListener('click', () => {
    lightSettingsOpen = false;
    renderPanels();
  });
  // 고르는 동작에 따라 알맞은 패널을 연다: 조명 → 조명 설정, 세트·사람 모형 → 선택한 객체 속성
  onSelect(kind => {
    if (kind === 'fixture') openLightSettings();
    else if ((kind === 'set' || kind === 'actor') && !readNoAutoOpen(AUTO_OPEN_PROPS_KEY)) openPanel('props');
    else { if (!kind) lightSettingsOpen = false; renderPanels(); }
  });
  bindNoAutoOpen('props-no-auto', AUTO_OPEN_PROPS_KEY);
  // 선택한 조명이 지워지거나 씬이 바뀌면 조명 설정을 숨긴다
  subscribe(renderPanels);
  renderPanels();
};

const readNoAutoOpen = (key: string) => {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};
const readNoAutoOpen3D = () => readNoAutoOpen(AUTO_OPEN_3D_KEY);

/** "자동으로 열지 않기" 체크박스를 localStorage 값과 묶는다 */
const bindNoAutoOpen = (inputId: string, key: string) => {
  const input = $<HTMLInputElement>(inputId);
  if (!input) return;
  input.checked = readNoAutoOpen(key);
  input.addEventListener('change', () => {
    try { localStorage.setItem(key, input.checked ? '1' : '0'); } catch { /* 저장소를 못 쓰면 이번 세션만 */ }
  });
};

/* ---------- 파일 알약 ---------- */

/** 파일 이름 (확장자 없이). 저장하거나 불러오기 전에는 null = "이름 없는 작업" */
let fileName: string | null = null;
/** 마지막으로 저장하거나 불러온 뒤 작업 내용이 바뀌었는가 */
let dirty = false;

const renderFileState = () => {
  const label = $('file-name');
  if (label) label.textContent = fileName ?? '이름 없는 작업';
  const saveState = $('save-state');
  if (saveState) {
    saveState.textContent = dirty ? '저장 안 됨 · 내 컴퓨터' : fileName ? '저장됨 · 내 컴퓨터' : '내 컴퓨터';
    saveState.classList.toggle('dirty', dirty);
  }
};

/** 파일 이름을 그 자리에서 입력칸으로 바꾼다. thenSave면 Enter와 함께 저장한다 (다른 이름으로 저장) */
const startFileRename = (thenSave: boolean) => {
  const label = $('file-name');
  if (!label || label.hidden) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'filename-input';
  input.value = fileName ?? '';
  input.placeholder = thenSave ? '파일 이름을 적고 Enter' : '이름 없는 작업';
  input.setAttribute('aria-label', '파일 이름');
  label.hidden = true;
  label.after(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    const name = input.value.trim().replace(/\.json$/i, '');
    // 입력칸을 지우면 blur가 바로 일어나므로, 저장할지는 지우기 전에 정해 둔다
    const download = save && thenSave;
    input.remove();
    label.hidden = false;
    if (save && name) {
      fileName = name;
      if (download) saveProject(name);
    }
    renderFileState();
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // 도구 단축키가 먹지 않게
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  // 바깥을 누르면 이름만 바꾸고 저장은 하지 않는다
  input.addEventListener('blur', () => { thenSave = false; finish(true); });
};

const saveCurrent = () => {
  if (fileName) saveProject(fileName);
  else startFileRename(true);
};

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
      if (action === 'save') saveCurrent();
      if (action === 'saveas') startFileRename(true);
      // 저장하지 않은 변경이 있을 때만 확인을 묻는다
      if (action === 'workspace' && (!dirty || window.confirm('저장하지 않은 작업은 사라집니다. 작업 공간 선택 화면으로 돌아갈까요?'))) {
        if (view3DOn) void setViewMode('2d');
        showLanding();
      }
    });
  });

  $('undo-btn')?.addEventListener('click', () => undo());
  $('redo-btn')?.addEventListener('click', () => redo());

  $('file-name')?.addEventListener('click', () => startFileRename(false));

  // manager.ts가 저장·불러오기 때, store가 새 작업을 시작할 때 알려 준다 (name이 null이면 새 작업)
  window.addEventListener('lighting:file', (e) => {
    const name = (e as CustomEvent<{ name: string | null }>).detail?.name ?? null;
    fileName = name ? name.replace(/\.json$/i, '') : null;
    dirty = false;
    renderFileState();
  });
  onEdit(() => {
    if (dirty) return;
    dirty = true;
    renderFileState();
  });
  // Ctrl+S: 저장
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
      if (document.getElementById('editor-screen')?.style.display !== 'flex') return;
      e.preventDefault();
      saveCurrent();
    }
  });
  renderFileState();
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
  // 3D로 들어가면 3D 극장 구조 패널을 자동으로 연다 (끄는 체크가 있으면 열지 않음)
  if (on && !readNoAutoOpen3D()) openPanel('venue3d');
  setToolsViewMode(on);
  $('view-2d')?.setAttribute('aria-pressed', String(!on));
  $('view-3d')?.setAttribute('aria-pressed', String(on));
  if (!on) window.dispatchEvent(new Event('resize'));
};

const initVenue3DPanel = () => {
  bindNoAutoOpen('venue3d-no-auto', AUTO_OPEN_3D_KEY);
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
  $('help-btn')?.addEventListener('click', () => openPanel(openPanelId === 'help' ? null : 'help'));
  initTools();
  initFilePill();
  initViewSwitch();
  initVenue3DPanel();
  initSceneDrawer();
  initZoom();
};
