// src/tutorial/lessons.ts
// 튜토리얼 강의 내용. 강의 순서와 목적은 docs/tutorial/TUTORIAL_SPEC.md §4
// 할 일이 있는 단계는 done()으로 앱 상태를 읽어 저절로 넘어간다.

import { actorFaceHeight, getCurrentCue, getState, initVenue, setState } from '../state/store';
import { GeometryEngine } from '../engine/geometry';
import { dimmerLevel } from '../engine/photometrics';
import { openSelected, selectFixture, selectSet } from '../ui/selection';
import { resetCanvasZoom, worldToScreen } from '../render/canvas';
import { getFileState, openPanel, setViewMode } from '../ui/shell';
import { getTool, setTool } from '../ui/tools';
import { markNewWork } from '../cloud/projects';
import { createFixture } from '../ui/fixture';
import { VENUES } from '../config/venues';
import { around, el, first, union, type TutorialLesson } from './engine';
import type { Actor, Position2D, SetPiece } from '../types';

/* ---------- 읽기 도우미 ---------- */

/** 무대 좌표(m)를 화면(viewport) 좌표로 */
const screenOf = (p: Position2D) => {
  const canvas = document.getElementById('stageCanvas');
  if (!canvas || canvas.style.display === 'none') return null;
  const rect = canvas.getBoundingClientRect();
  const q = worldToScreen(p);
  return { x: rect.left + q.x, y: rect.top + q.y };
};
const stagePoint = (p: () => Position2D | null | undefined, half = 22) => (): DOMRect | null => {
  const point = p();
  const s = point ? screenOf(point) : null;
  return s ? around(s.x, s.y, half) : null;
};

const firstFixture = () => getCurrentCue()?.fixtures[0];
const firstActor = () => getState().actors.find(a => a.is_visible);
const panelOpen = (id: string) => document.querySelector<HTMLElement>(`[data-panel="${id}"]`)?.hidden === false;
const lightSettingsOpen = () => document.getElementById('light-settings')?.hidden === false;
const is3D = () => document.getElementById('stageCanvas')?.style.display === 'none';

/* ---------- 연습용 작업 ---------- */

const HUMANITIES = VENUES.humanities;
/** 연습용 배우 자리: 객석 앞 연기 공간의 가운데 */
const ACTOR_SPOT: Position2D = { x: HUMANITIES.stage.width / 2, y: (HUMANITIES.model3d?.seating?.y0 ?? HUMANITIES.stage.depth) / 2 };
/** 앞에서 비추는 조명을 달 자리: 배우보다 객석 쪽으로 약 45° 각도가 되는 파이프 */
const FRONT_PIPE: Position2D = (() => {
  const pipes = HUMANITIES.model3d?.catwalk.pipes ?? [];
  const want = ACTOR_SPOT.y + HUMANITIES.stage.defaultFixtureZ;
  const pipe = pipes.reduce((best, p) => Math.abs(p.y - want) < Math.abs(best.y - want) ? p : best, pipes[0] ?? { y: want });
  return { x: ACTOR_SPOT.x, y: pipe.y };
})();

/** 지금 열린 작업이 튜토리얼 연습용인가. 새 작업·불러오기·저장(lighting:file)이 일어나면 아니게 된다 */
let practiceOpen = false;
window.addEventListener('lighting:file', () => { practiceOpen = false; });

/**
 * 인문소극장, 배우 한 명. withLight면 배우를 앞에서 비추는 엘립소이달 하나를 미리 달아 둔다.
 * 편집 화면에 저장 안 된 작업이 있으면 먼저 묻는다 (홈에서 시작하면 묻지 않는다)
 */
const setupPractice = (withLight: boolean): boolean => {
  const editorOpen = document.getElementById('editor-screen')?.style.display === 'flex';
  // 열려 있는 것이 튜토리얼 연습용 작업이면 저장 여부를 묻지 않는다
  if (editorOpen && !practiceOpen && getFileState().dirty && !window.confirm('지금 작업에 저장하지 않은 내용이 있습니다.\n튜토리얼을 시작하면 연습용 작업으로 바뀝니다. 계속할까요?')) return false;
  initVenue('humanities');
  markNewWork();
  setState(s => {
    s.cues.forEach(cue => { cue.fixtures = []; });
    s.selected_fixture_id = null;
    const actor = s.actors[0];
    if (actor) { actor.x = ACTOR_SPOT.x; actor.y = ACTOR_SPOT.y; }
    if (withLight) {
      const light = createFixture('ellipsoidal', 1, s.stage_config);
      light.position = { x: FRONT_PIPE.x, y: FRONT_PIPE.y, z: s.stage_config.default_z };
      light.target = { x: ACTOR_SPOT.x, y: ACTOR_SPOT.y };
      s.cues[s.active_cue_index].fixtures.push(light);
    }
  });
  setTool('select');
  openPanel(null);
  void setViewMode('2d');
  resetCanvasZoom();
  practiceOpen = true;
  return true;
};

/* ---------- 1강: 화면 둘러보기 ---------- */

const lessonTour: TutorialLesson = {
  id: 'tour',
  title: '1강 · 화면 둘러보기',
  minutes: 3,
  summary: '도구, 오른쪽 목록, 씬, 2D/3D가 어디 있는지 봅니다.',
  setup: () => setupPractice(true),
  steps: [
    {
      title: '조명 도우미에 오신 것을 환영합니다',
      body: `<p>이 튜토리얼은 <b>연습용 작업</b>(인문소극장, 배우 한 명, 배우를 비추는 조명 하나)에서 진행합니다. 원래 작업은 건드리지 않습니다.</p>
        <p>할 일이 있는 단계는 직접 해 보면 넘어갑니다. 설명이 더 있으면 다 읽고 <b>다음</b>을 누르세요. 언제든 <b>건너뛰기</b>나 <b>그만하기</b>를 누를 수 있습니다.</p>`
    },
    {
      title: '왼쪽: 도구',
      target: union('.toolrail', '.toolrail .lbl'),
      body: `<p>조명·세트·사람 모형을 <b>놓는 도구</b>입니다. 놓고 나면 저절로 맨 위의 <b>선택</b> 도구로 돌아옵니다.</p>
        <p>각 버튼의 글자(<kbd>E</kbd>, <kbd>F</kbd> …)는 키보드 단축키입니다.</p>`
    },
    {
      title: '가운데: 무대 평면도',
      target: el('#stageCanvas'),
      body: `<p>무대를 위에서 내려다본 그림입니다. 빈 곳을 끌면 화면이 움직이고, 마우스 휠로 확대·축소합니다.</p>
        <p>초록 십자는 <b>배우</b>이고, 옆의 숫자가 배우 얼굴에 닿는 밝기입니다.</p>`
    },
    {
      title: '오른쪽: 설정 목록',
      target: el('#tray'),
      body: `<p><b>선택한 것</b>에는 지금 고른 조명이나 물체의 설정이, <b>작업 전체</b>에는 작업 전체에 해당하는 설정이 있습니다.</p>
        <p>아이콘을 누르면 그 바로 아래에서 패널이 펼쳐집니다.</p>`
    },
    {
      title: '"빛 범위 표시"를 열어 보세요',
      target: first(el('[data-panel="display"]'), el('[data-tray="display"]')),
      onEnter: () => openPanel(null),
      done: () => panelOpen('display'),
      manual: true,
      body: '<p>오른쪽의 <b>빛 범위 표시</b> 아이콘을 누르세요. 평면도에 빛을 어떻게 그릴지 고르는 곳입니다.</p>',
      afterBody: `<p>체크를 하나씩 켜고 끄면서 평면도의 빛이 어떻게 바뀌는지 보세요.</p>
        <p><b>바닥에 닿는 빛</b>: 바닥이 밝아지는 범위 (그라데이션 또는 꽉 채우기).<br><b>배우 얼굴 높이에 닿는 빛</b>: 배우 얼굴 높이에서 빛이 닿는 범위.<br><b>빔·필드 각도선</b>: 밝기 50%, 10% 경계선.</p>
        <p>다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '아래: 씬',
      target: el('#scene-drawer'),
      body: '<p>공연 순서대로 놓인 <b>씬</b> 목록입니다. 누르면 썸네일 카드가 올라오고, 씬을 만들고 복사하고 순서를 바꿀 수 있습니다.</p>'
    },
    {
      title: '3D로 보기',
      target: el('#view-3d'),
      done: is3D,
      manual: true,
      body: '<p>위쪽 가운데의 <b>3D 보기</b>를 눌러 보세요. 같은 조명을 극장 안에서 본 모습으로 보여 줍니다.</p>',
      afterBody: `<p>조명이 배우를 어떻게 비추는지, 빛줄기가 어디로 가는지 극장 안에서 본 모습입니다. 평면도로는 알기 어려운 높이와 각도를 여기서 확인합니다.</p>
        <p>화면을 끌면 시점이 돌아가고, 휠로 확대합니다. 둘러봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '다시 2D로',
      target: el('#view-2d'),
      done: () => !is3D(),
      body: '<p>조명을 놓고 고치는 일은 2D에서 하므로 <b>2D 평면</b>을 눌러 돌아오세요.</p>'
    },
    {
      title: '모르겠으면 도우미',
      target: el('#help-btn'),
      body: '<p>아래 왼쪽의 <b>?</b> 버튼을 누르면 지금 도구의 설명과 단축키, 그리고 이 튜토리얼 목록이 나옵니다.</p><p>다음 강의에서는 첫 조명을 달아 봅니다.</p>'
    }
  ]
};

/* ---------- 2강: 첫 조명 달기 ---------- */

const lessonFirstLight: TutorialLesson = {
  id: 'first-light',
  title: '2강 · 첫 조명 달기',
  minutes: 4,
  summary: '엘립소이달을 달고, 배우를 비추고, 얼굴 밝기를 읽습니다.',
  setup: () => setupPractice(false),
  steps: [
    {
      title: '엘립소이달 놓기 도구를 고르세요',
      target: el('[data-tool="ellip"]'),
      done: () => getTool() === 'ellip',
      body: '<p>왼쪽의 <b>엘립소이달 놓기</b>를 누르거나 키보드 <kbd>E</kbd>를 누르세요. 가장 많이 쓰는, 모양을 다듬을 수 있는 조명입니다.</p>'
    },
    {
      title: '배우 앞쪽에 조명을 다세요',
      target: stagePoint(() => FRONT_PIPE, 30),
      done: () => (firstFixture() ? true : false),
      body: `<p>렌즈는 그대로 <b>36°</b>를 씁니다 (도구 버튼을 마우스로 누르면 옆에 19° ~ 50°, 줌이 나옵니다. 숫자가 클수록 넓게 비춥니다).</p>
        <p>평면도에서 <b>파란 테두리로 표시한 곳</b>을 누르세요. 배우보다 객석 쪽에 있는 캣워크 파이프입니다. 조명은 누른 곳에서 가장 가까운 파이프에 달립니다.</p>`
    },
    {
      title: '조명이 달렸습니다',
      target: first(el('#light-settings'), el('#light-settings-btn')),
      body: `<p>조명을 놓으면 오른쪽에 <b>조명 설정</b>이 열립니다. 렌즈, 젤(색), 디머(밝기), 셔터를 여기서 바꿉니다.</p>
        <p>평면도의 새 조명 기호는 비추는 방향을 향해 있습니다.</p>`
    },
    {
      title: '조준점을 배우에게 끌어 오세요',
      target: stagePoint(() => firstFixture()?.target),
      done: () => {
        const fix = firstFixture();
        const actor = firstActor();
        return Boolean(fix && actor && Math.hypot(fix.target.x - actor.x, fix.target.y - actor.y) < 1.0);
      },
      body: '<p>조명에서 뻗어 나온 <b>노란 점이 조준점</b>입니다. 이 점을 끌어서 초록 십자(배우) 위에 놓으세요.</p>'
    },
    {
      title: '배우 얼굴 밝기 읽기',
      target: () => {
        const actor = firstActor();
        const s = actor ? screenOf(actor) : null;
        return s ? new DOMRect(s.x - 16, s.y - 16, 200, 32) : null;
      },
      body: `<p>배우 옆의 <b>얼굴 N lux</b>가 객석 쪽을 보는 배우 얼굴에 닿는 밝기입니다. 조명을 배우에게 돌렸더니 숫자가 커졌죠?</p>
        <p>배우 <b>뒤쪽</b>에 조명을 달면 얼굴은 0에 가깝게 나옵니다. 얼굴을 밝히려면 객석 쪽에서 비춰야 합니다.</p>`
    },
    {
      title: '조명 설정을 닫아 보세요',
      target: first(el('#light-settings-close'), el('#light-settings-btn')),
      onEnter: () => {
        const fix = firstFixture();
        if (fix && !lightSettingsOpen()) document.getElementById('light-settings-btn')?.click();
      },
      done: () => !lightSettingsOpen(),
      manual: true,
      body: '<p>조명 설정 오른쪽 위의 <b>✕</b>를 누르세요.</p>',
      afterBody: `<p>닫혔습니다. 조명 설정은 조명을 고를 때마다 저절로 열리고, 오른쪽 <b>조명 설정</b> 아이콘으로도 열고 닫을 수 있습니다.</p>
        <p>자꾸 열리는 게 불편하면 패널 맨 아래의 <b>조명을 누를 때 자동으로 열지 않기</b>를 켜 두세요. 다음 단계에서 다시 여는 방법을 해 봅니다.</p>`
    },
    {
      title: '조명을 두 번 누르면 다시 열립니다',
      target: stagePoint(() => firstFixture()?.position, 24),
      done: lightSettingsOpen,
      body: '<p>평면도에서 방금 단 <b>조명 기호를 두 번</b> 누르세요. 닫아 둔 조명 설정이 다시 열립니다.</p>'
    },
    {
      title: '첫 조명을 달았습니다',
      body: `<p>조명을 놓고, 조준하고, 배우 얼굴 밝기를 읽는 것까지 해 봤습니다.</p>
        <p>연습용 작업은 그대로 남아 있으니 더 만져 봐도 됩니다. 다음 강의에서는 렌즈·젤·디머·셔터로 빛을 다듬습니다.</p>`
    }
  ]
};


/* ---------- 공통 도우미 (3~5강) ---------- */

/** 조명 설정 패널의 n번째 묶음 (1 기종·렌즈, 2 젤, 3 디머, 4 셔터, 5 3D 그림자) */
const lsSection = (n: number) => el(`#light-settings-body .ls-section:nth-child(${n})`);
/** 선택한 객체 속성에서 입력칸이 들어 있는 줄 */
const ppRow = (inputId: string) => (): DOMRect | null => {
  const row = document.getElementById(inputId)?.closest<HTMLElement>('.pp-row');
  return row && !row.closest('[hidden]') ? row.getBoundingClientRect() : null;
};
/** 무대 좌표 여러 점을 감싸는 화면 사각형 */
const stageBox = (points: () => Position2D[] | null, pad = 14) => (): DOMRect | null => {
  const pts = (points() ?? []).map(screenOf).filter((q): q is { x: number; y: number } => q !== null);
  if (!pts.length) return null;
  const xs = pts.map(q => q.x);
  const ys = pts.map(q => q.y);
  return new DOMRect(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);
};
const faceLux = (actor: Actor | undefined) => {
  const cue = getCurrentCue();
  if (!actor || !cue) return 0;
  return GeometryEngine.calculateProbeBrightness(cue, getState().stage_config, actor, actorFaceHeight(actor)).faceLux;
};
/** 연습용 조명을 고르고 조명 설정을 연다 (자동으로 열지 않기를 켜 둔 사람도 보이게) */
const focusLight = () => {
  const fix = firstFixture();
  if (!fix) return;
  selectFixture(fix.id);
  openSelected();
};

/** 세트의 지역 좌표 → 무대 좌표 (canvas.ts와 같은 계산) */
const setLocal = (piece: SetPiece, lx: number, ly: number): Position2D => {
  const r = piece.rotation * Math.PI / 180;
  return { x: piece.x + lx * Math.cos(r) - ly * Math.sin(r), y: piece.y + lx * Math.sin(r) + ly * Math.cos(r) };
};
const firstSet = () => (getState().stage_config.set_pieces ?? [])[0];
/** 노란 회전 손잡이: 위쪽 변 가운데에서 화면 기준 26px 바깥 (canvas.ts ROTATE_STICK_PX) */
const rotateHandleRect = (): DOMRect | null => {
  const piece = firstSet();
  if (!piece) return null;
  const c = screenOf(piece);
  const top = screenOf(setLocal(piece, 0, -piece.depth / 2));
  if (!c || !top) return null;
  const len = Math.hypot(top.x - c.x, top.y - c.y) || 1;
  return around(top.x + (top.x - c.x) / len * 26, top.y + (top.y - c.y) / len * 26, 16);
};

/* ---------- 3강: 조명 다듬기 ---------- */

let lensAtStart = '';
let shutterAtStart = '';
const lensKey = () => {
  const fix = firstFixture();
  if (!fix) return '';
  return fix.type === 'ellipsoidal' ? fix.lens_type : fix.type === 'zoom' ? `zoom-${fix.zoom_range}` : fix.type;
};
const shutterKey = () => {
  const fix = firstFixture();
  return fix && 'shutter_polygon' in fix ? JSON.stringify(fix.shutter_polygon) : '';
};
const shutterCorners = (): Position2D[] | null => {
  const fix = firstFixture();
  if (!fix || !('shutter_polygon' in fix) || !fix.shutter_active) return null;
  return fix.shutter_polygon.map(p => ({ x: fix.target.x + p.dx, y: fix.target.y + p.dy }));
};

const lessonShape: TutorialLesson = {
  id: 'shape',
  title: '3강 · 조명 다듬기',
  minutes: 4,
  summary: '렌즈, 젤, 디머, 셔터로 빛의 크기·색·밝기·모양을 바꿉니다.',
  setup: () => setupPractice(true),
  steps: [
    {
      title: '조명 설정',
      target: first(el('#light-settings'), el('#light-settings-btn')),
      onEnter: focusLight,
      body: `<p>배우를 비추는 조명 <b>L1</b>을 골랐습니다. 오른쪽 <b>조명 설정</b>에서 이 조명의 렌즈, 젤(색), 디머(밝기), 셔터, 3D 그림자를 바꿉니다.</p>
        <p>하나씩 바꿔 보면서 평면도의 빛과 배우 옆의 <b>얼굴 N lux</b>가 어떻게 달라지는지 보세요.</p>`
    },
    {
      title: '렌즈를 바꿔 보세요',
      target: lsSection(1),
      onEnter: () => { focusLight(); lensAtStart = lensKey(); },
      done: () => lensKey() !== lensAtStart,
      manual: true,
      body: '<p><b>렌즈</b> 목록에서 지금(36°)과 다른 렌즈를 고르세요. 숫자는 빛이 퍼지는 각도입니다.</p>',
      afterBody: `<p>평면도의 빛 크기가 바뀌었습니다. <b>19°</b>처럼 좁은 렌즈는 작고 밝게, <b>50°</b>처럼 넓은 렌즈는 넓고 어둡게 비춥니다.</p>
        <p>배우 얼굴 밝기 숫자도 함께 바뀐 것을 확인하고 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '젤(색)을 넣어 보세요',
      target: lsSection(2),
      onEnter: focusLight,
      done: () => Boolean(firstFixture()?.gel),
      manual: true,
      body: '<p><b>젤</b>의 색 칸 중 하나를 누르세요. 극장에 있는 LEE 필터들입니다.</p>',
      afterBody: `<p>빛 색이 바뀌고 얼굴 밝기가 줄었습니다. 젤은 빛의 일부만 통과시키기 때문입니다 (투과율). 진한 색일수록 더 어두워집니다.</p>
        <p><b>✕</b> 칸을 누르면 젤을 뺄 수 있습니다. 다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '디머로 밝기를 줄여 보세요',
      target: lsSection(3),
      onEnter: focusLight,
      done: () => { const fix = firstFixture(); return Boolean(fix && dimmerLevel(fix) < 100); },
      manual: true,
      body: '<p><b>디머</b> 막대를 왼쪽으로 끌었다가 놓으세요.</p>',
      afterBody: `<p>디머를 <b>50%</b>로 내려도 실제 빛은 약 <b>25%</b>입니다. 텅스텐 램프는 전압을 낮추면 빛이 그보다 더 빨리 줄어들기 때문입니다 (막대 아래 "실제 광량"을 보세요).</p>
        <p>다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '셔터를 켜세요',
      target: lsSection(4),
      onEnter: focusLight,
      done: () => { const fix = firstFixture(); return Boolean(fix && 'shutter_active' in fix && fix.shutter_active); },
      body: '<p><b>셔터 켜기</b>를 체크하세요. 엘립소이달은 안쪽의 날(셔터)로 빛의 가장자리를 곧게 자를 수 있습니다.</p>'
    },
    {
      title: '빨간 꼭짓점을 끌어 빛을 잘라 보세요',
      target: stageBox(shutterCorners),
      onEnter: () => { shutterAtStart = shutterKey(); },
      done: () => shutterKey() !== shutterAtStart,
      manual: true,
      body: '<p>평면도에 생긴 <b>빨간 꼭짓점 4개</b> 중 하나를 끌어 보세요. 빛이 그 선을 따라 잘립니다.</p>',
      afterBody: `<p>빛이 잘렸습니다. 셔터는 무대 밖 벽이나 객석, 무대 장치로 새어 나가는 빛을 자를 때 씁니다.</p>
        <p>꼭짓점마다 따로 움직여서 비스듬하게 자를 수도 있습니다. 다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '빛을 다듬었습니다',
      body: `<p>렌즈로 크기를, 젤로 색을, 디머로 밝기를, 셔터로 모양을 바꿔 봤습니다.</p>
        <p>다음 강의에서는 배우를 더 세우고, 배우마다 얼굴이 얼마나 밝은지 읽어 봅니다.</p>`
    }
  ]
};

/* ---------- 4강: 배우 얼굴 밝기 읽기 ---------- */

const secondActor = () => getState().actors[1];
const SECOND_SPOT: Position2D = { x: ACTOR_SPOT.x + 3, y: ACTOR_SPOT.y + 0.5 };

const lessonActors: TutorialLesson = {
  id: 'actors',
  title: '4강 · 배우 얼굴 밝기 읽기',
  minutes: 4,
  summary: '배우를 더 세우고, 키를 바꾸고, 어느 조명이 얼마나 비추는지 봅니다.',
  setup: () => setupPractice(true),
  steps: [
    {
      title: '사람 모형 놓기 도구를 고르세요',
      target: el('[data-tool="actor"]'),
      done: () => getTool() === 'actor',
      body: '<p>왼쪽 맨 아래의 <b>사람 모형 놓기</b>를 누르거나 키보드 <kbd>A</kbd>를 누르세요. 배우는 여러 명 세울 수 있습니다.</p>'
    },
    {
      title: '표시한 곳을 누르세요',
      target: stagePoint(() => SECOND_SPOT, 26),
      done: () => getState().actors.length >= 2,
      body: '<p>평면도에서 <b>파란 테두리로 표시한 곳</b>을 누르세요. 그 자리에 두 번째 배우가 섭니다.</p>'
    },
    {
      title: '선택한 객체 속성',
      target: first(el('[data-panel="props"]'), el('[data-tray="props"]')),
      onEnter: () => { if (!panelOpen('props')) openPanel('props'); },
      body: `<p>새 배우(<b>배우2</b>)의 속성입니다. 이름, 위치, 키, 의상 색, 그리고 <b>이 자리의 밝기</b>가 나옵니다.</p>
        <p>배우2는 조명 밖에 서 있어서 얼굴 밝기가 낮습니다.</p>`
    },
    {
      title: '키를 바꿔 보세요',
      target: ppRow('pp-aheight'),
      onEnter: () => { if (!panelOpen('props')) openPanel('props'); },
      done: () => Boolean(secondActor() && Math.abs(secondActor().height - 1.75) > 0.001),
      manual: true,
      body: '<p><b>키</b> 칸의 숫자(mm)를 바꾸고 Enter를 누르세요. 예: 1600</p>',
      afterBody: `<p>키를 바꾸면 <b>얼굴 높이</b>(키 − 120 mm)가 바뀌고, 그 높이에서 밝기를 다시 계산합니다. 어린이 역이나 키 큰 배우처럼 사람마다 다르게 둘 수 있습니다.</p>
        <p>평면도의 "배우 얼굴 높이에 닿는 빛"은 이와 상관없이 <b>빛 범위 표시</b>에서 정한 높이로 그립니다. 다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '배우2를 빛 안으로 옮기세요',
      target: stageBox(() => {
        const a = firstActor();
        const b = secondActor();
        return a && b ? [a, b] : null;
      }, 24),
      done: () => {
        const lux = faceLux(secondActor());
        return lux > 50 && lux >= faceLux(getState().actors[0]) * 0.5;
      },
      body: '<p>배우2의 초록 십자를 끌어서 <b>첫 배우 옆, 빛이 닿는 곳</b>으로 옮기세요. 옮기는 동안 얼굴 밝기 숫자가 바뀝니다.</p>'
    },
    {
      title: '어느 조명이 얼마나 비추나',
      target: first(el('.pp-contrib'), el('[data-panel="props"]')),
      onEnter: () => { if (!panelOpen('props')) openPanel('props'); },
      body: `<p>아래 표는 <b>조명별</b>로 이 배우의 얼굴과 머리 위(수평면)에 닿는 밝기입니다. 줄을 누르면 그 조명이 선택됩니다.</p>
        <p>배우가 어둡거나 너무 밝을 때, 어느 조명이 일을 하고 있는지 여기서 찾습니다.</p>`
    },
    {
      title: '배우 밝기를 읽었습니다',
      body: `<p>배우를 더 세우고, 키를 바꾸고, 조명별 밝기를 읽어 봤습니다.</p>
        <p>다음 강의에서는 벽 같은 세트가 빛을 가리는 모습과 그림자를 봅니다.</p>`
    }
  ]
};

/* ---------- 5강: 세트와 그림자 ---------- */

/** 배우 뒤(무대 안쪽)에 세우는 벽 자리 */
const WALL_SPOT: Position2D = { x: ACTOR_SPOT.x, y: ACTOR_SPOT.y - 1.5 };
let setSizeAtStart = '';
const setSizeKey = () => { const piece = firstSet(); return piece ? `${piece.width}x${piece.depth}` : ''; };
const keepSetSelected = () => { const piece = firstSet(); if (piece && getState().selected_set_id !== piece.id) selectSet(piece.id); };

const lessonSets: TutorialLesson = {
  id: 'sets',
  title: '5강 · 세트와 그림자',
  minutes: 5,
  summary: '벽을 세우고, 높이·크기·각도를 바꾸고, 3D 그림자를 봅니다.',
  setup: () => setupPractice(true),
  steps: [
    {
      title: '벽 놓기 도구를 고르세요',
      target: el('[data-tool="wall"]'),
      done: () => getTool() === 'wall',
      body: '<p>왼쪽의 <b>벽 놓기</b>를 누르거나 <kbd>W</kbd>를 누르세요. 가로 1220 · 두께 30 · 높이 2440 mm 벽(평)이 놓입니다.</p>'
    },
    {
      title: '배우 뒤에 벽을 놓으세요',
      target: stagePoint(() => WALL_SPOT, 26),
      done: () => Boolean(firstSet()),
      body: '<p><b>파란 테두리로 표시한 곳</b>(배우 뒤, 무대 안쪽)을 누르세요. 그 자리에 벽이 섭니다.</p>'
    },
    {
      title: '숫자로 벽 높이를 바꾸세요',
      target: union('.vcb'),
      onEnter: keepSetSelected,
      done: () => Boolean(firstSet() && Math.abs(firstSet().height - 2.44) > 0.001),
      manual: true,
      body: '<p>세트를 놓은 직후에는 숫자를 바로 치면 높이가 됩니다. 키보드로 <kbd>1200</kbd>을 치고 <kbd>Enter</kbd>를 누르세요. (아래 <b>높이</b> 칸에 들어가고, 단위는 mm입니다)</p>',
      afterBody: `<p>벽 높이가 <b>1200 mm</b>가 되었습니다. 덧마루나 단을 놓은 뒤 높이를 맞출 때도 이렇게 합니다.</p>
        <p>높이는 <b>선택한 객체 속성</b>에서도 mm로 바꿀 수 있습니다. 다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '흰 꼭짓점을 끌어 크기를 바꾸세요',
      target: stageBox(() => {
        const piece = firstSet();
        return piece ? [setLocal(piece, piece.width / 2, -piece.depth / 2)] : null;
      }, 16),
      onEnter: () => { keepSetSelected(); setSizeAtStart = setSizeKey(); },
      done: () => setSizeKey() !== setSizeAtStart,
      manual: true,
      body: '<p>고른 벽의 네 귀퉁이에 있는 <b>흰 동그라미</b> 중 하나를 끌어 보세요.</p>',
      afterBody: `<p>반대쪽 꼭짓점은 그대로 있고 크기만 바뀝니다. 끄는 동안 치수(mm)가 보입니다.</p>
        <p>정확한 값은 <b>선택한 객체 속성</b>에서 mm로 적을 수도 있습니다. 다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '노란 손잡이로 돌려 보세요',
      target: rotateHandleRect,
      onEnter: keepSetSelected,
      done: () => Boolean(firstSet() && Math.abs(firstSet().rotation) > 0.5),
      manual: true,
      body: '<p>벽 위쪽의 <b>노란 동그라미</b>를 잡고 돌리세요.</p>',
      afterBody: '<p>15°, 30°, 45° … 근처에서는 딱 맞게 붙습니다. 몸통을 끌면 옮겨집니다. 다 봤으면 <b>다음</b>을 누르세요.</p>'
    },
    {
      title: '3D로 보세요',
      target: el('#view-3d'),
      done: is3D,
      body: '<p>위쪽의 <b>3D 보기</b>를 누르세요. 벽이 실제로 어떻게 서 있는지 봅니다.</p>'
    },
    {
      title: '조명의 그림자를 켜세요',
      target: first(lsSection(5), el('#light-settings-btn')),
      onEnter: focusLight,
      done: () => Boolean(firstFixture()?.cast_shadow),
      manual: true,
      body: '<p>조명 설정의 <b>3D 그림자</b>에서 <b>3D에서 이 조명의 그림자 계산</b>을 체크하세요.</p>',
      afterBody: `<p>배우와 벽 뒤로 그림자가 생겼습니다. 그림자는 계산이 무거워서 한 번에 <b>4개 조명</b>까지만 켤 수 있습니다.</p>
        <p>다 봤으면 <b>다음</b>을 누르세요.</p>`
    },
    {
      title: '세트와 그림자를 봤습니다',
      onEnter: () => { void setViewMode('2d'); },
      body: `<p>벽을 세우고, 숫자로 높이를 정하고, 손잡이로 크기와 각도를 바꾸고, 3D 그림자를 봤습니다.</p>
        <p>남은 강의(씬 만들기, 3D 확인, 저장과 채널 검사)는 곧 추가됩니다.</p>`
    }
  ]
};

export const LESSONS: TutorialLesson[] = [lessonTour, lessonFirstLight, lessonShape, lessonActors, lessonSets];
