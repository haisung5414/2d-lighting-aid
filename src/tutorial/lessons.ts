// src/tutorial/lessons.ts
// 튜토리얼 강의 내용. 강의 순서와 목적은 docs/tutorial/TUTORIAL_SPEC.md §4
// 할 일이 있는 단계는 done()으로 앱 상태를 읽어 저절로 넘어간다.

import { getCurrentCue, getState, initVenue, setState } from '../state/store';
import { resetCanvasZoom, worldToScreen } from '../render/canvas';
import { getFileState, openPanel, setViewMode } from '../ui/shell';
import { getTool, setTool } from '../ui/tools';
import { markNewWork } from '../cloud/projects';
import { VENUES } from '../config/venues';
import { around, el, first, union, type TutorialLesson } from './engine';
import type { Position2D } from '../types';

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

/** 인문소극장, 배우 한 명, 조명 없음. 저장 안 된 작업이 있으면 먼저 묻는다 */
const setupPractice = (): boolean => {
  if (getFileState().dirty && !window.confirm('지금 작업에 저장하지 않은 내용이 있습니다.\n튜토리얼을 시작하면 연습용 작업으로 바뀝니다. 계속할까요?')) return false;
  initVenue('humanities');
  markNewWork();
  setState(s => {
    s.cues.forEach(cue => { cue.fixtures = []; });
    s.selected_fixture_id = null;
    const actor = s.actors[0];
    if (actor) { actor.x = ACTOR_SPOT.x; actor.y = ACTOR_SPOT.y; }
  });
  setTool('select');
  openPanel(null);
  void setViewMode('2d');
  resetCanvasZoom();
  return true;
};

/* ---------- 1강: 화면 둘러보기 ---------- */

const lessonTour: TutorialLesson = {
  id: 'tour',
  title: '1강 · 화면 둘러보기',
  minutes: 3,
  summary: '도구, 오른쪽 목록, 씬, 2D/3D가 어디 있는지 봅니다.',
  setup: setupPractice,
  steps: [
    {
      title: '조명 도우미에 오신 것을 환영합니다',
      body: `<p>이 튜토리얼은 <b>연습용 작업</b>(인문소극장, 배우 한 명)에서 진행합니다. 원래 작업은 건드리지 않습니다.</p>
        <p>할 일이 있는 단계는 직접 해 보면 저절로 넘어갑니다. 언제든 <b>건너뛰기</b>나 <b>그만하기</b>를 누를 수 있습니다.</p>`
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
      body: '<p>오른쪽의 <b>빛 범위 표시</b> 아이콘을 누르세요. 바닥과 배우 얼굴 높이에 닿는 빛을 어떻게 그릴지 고르는 곳입니다.</p>'
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
      body: '<p>위쪽 가운데의 <b>3D 보기</b>를 눌러 보세요. 같은 조명을 극장 안에서 본 모습으로 보여 줍니다.</p>'
    },
    {
      title: '다시 2D로',
      target: el('#view-2d'),
      done: () => !is3D(),
      body: '<p>3D에서는 끌어서 시점을 돌리고, 휠로 확대합니다. 조명을 놓는 일은 2D에서 하므로 <b>2D 평면</b>을 눌러 돌아오세요.</p>'
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
  setup: setupPractice,
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
      body: '<p>조명 설정 오른쪽 위의 <b>✕</b>를 누르세요.</p>'
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

export const LESSONS: TutorialLesson[] = [lessonTour, lessonFirstLight];
