// src/tutorial/engine.ts
// 튜토리얼 실행기: 강조할 곳을 밝게 남기고 나머지를 어둡게 덮고, 옆에 말풍선을 띄운다.
// 덮개는 보기만 할 뿐 누르는 것을 막지 않는다 (pointer-events: none). 할 일이 있는 단계는 done()이 참이 되면 저절로 넘어간다.
// 사양: docs/tutorial/TUTORIAL_SPEC.md §2

import './tutorial.css';

export interface TutorialStep {
  title: string;
  /** 우리가 쓴 고정 HTML (사용자 입력은 넣지 않는다) */
  body: string;
  /** 강조할 곳. 없거나 찾지 못하면 말풍선만 가운데에 띄운다 */
  target?: () => DOMRect | null;
  /** 할 일이 있는 단계: 참이 되면 저절로 다음으로 넘어간다 (manual이면 다음 버튼으로 직접 넘긴다) */
  done?: () => boolean;
  /** 할 일을 마친 뒤에도 읽을 내용이 있으면 true: 저절로 넘어가지 않고 다음 버튼을 보인다 */
  manual?: boolean;
  /** 할 일을 마친 뒤 본문 대신 보여 줄 설명 */
  afterBody?: string;
  /** 단계를 시작할 때 한 번 (패널 닫기 등) */
  onEnter?: () => void;
}

export interface TutorialLesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  /** 강의를 시작하기 전에 연습용 작업 등을 준비한다. false를 돌려주면 시작하지 않는다 */
  setup?: () => boolean;
  steps: TutorialStep[];
}

const DONE_KEY = 'lightingAid.tutorial.done';
const PAD = 6;
const GAP = 14;
const BUBBLE_W = 320;
const ADVANCE_DELAY = 650;

/* ---------- 진행 기록 ---------- */

export const finishedLessons = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]); } catch { return new Set(); }
};
const markFinished = (id: string) => {
  const done = finishedLessons();
  done.add(id);
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* 기록 없이도 동작한다 */ }
};

/* ---------- 상태 ---------- */

let lessons: TutorialLesson[] = [];
let lesson: TutorialLesson | null = null;
let index = 0;
let completedAt = 0;
let frame = 0;
/** 화면이 가려져 requestAnimationFrame이 멈춰도 단계 확인은 이어 가도록 타이머도 함께 쓴다 */
let timer = 0;
let spot: HTMLDivElement | null = null;
let bubble: HTMLDivElement | null = null;
const changeListeners = new Set<() => void>();

export const isTutorialRunning = () => lesson !== null;
/** 튜토리얼이 시작·종료되거나 강의를 마쳤을 때 (목록 다시 그리기용) */
export const onTutorialChange = (listener: () => void) => { changeListeners.add(listener); };
const emitChange = () => changeListeners.forEach(listener => listener());

export const registerLessons = (list: TutorialLesson[]) => { lessons = list; };
export const getLessons = () => lessons;

/* ---------- 화면 ---------- */

const ensureElements = () => {
  if (!spot) {
    spot = document.createElement('div');
    spot.className = 'tut-spot';
    document.body.appendChild(spot);
  }
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'tut-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-live', 'polite');
    document.body.appendChild(bubble);
  }
};

const removeElements = () => {
  spot?.remove();
  bubble?.remove();
  spot = null;
  bubble = null;
};

const renderBubble = () => {
  if (!bubble || !lesson) return;
  const step = lesson.steps[index];
  const last = index === lesson.steps.length - 1;
  const nextLesson = last ? lessons[lessons.findIndex(l => l.id === lesson!.id) + 1] : undefined;
  const waiting = Boolean(step.done) && completedAt === 0;
  bubble.innerHTML = `
    <div class="tut-head"><span>${lesson.title}</span><small>${index + 1} / ${lesson.steps.length}</small></div>
    <h3>${completedAt ? '✓ ' : ''}${step.title}</h3>
    <div class="tut-body">${completedAt && step.afterBody ? step.afterBody : step.body}</div>
    <div class="tut-actions">
      <button type="button" class="tut-quiet" data-tut="quit">그만하기</button>
      <span class="tut-grow"></span>
      ${index > 0 ? '<button type="button" class="tut-quiet" data-tut="prev">이전</button>' : ''}
      ${waiting ? '<button type="button" class="tut-quiet" data-tut="skip">건너뛰기</button>' : ''}
      ${!waiting && !last ? '<button type="button" class="tut-primary" data-tut="next">다음</button>' : ''}
      ${last && nextLesson ? '<button type="button" class="tut-quiet" data-tut="finish">끝내기</button><button type="button" class="tut-primary" data-tut="nextLesson">다음 강의</button>' : ''}
      ${last && !nextLesson ? '<button type="button" class="tut-primary" data-tut="finish">끝내기</button>' : ''}
    </div>`;
  bubble.classList.toggle('waiting', waiting);
  bubble.querySelector('[data-tut="quit"]')?.addEventListener('click', () => stopTutorial());
  bubble.querySelector('[data-tut="prev"]')?.addEventListener('click', () => goTo(index - 1));
  bubble.querySelector('[data-tut="skip"]')?.addEventListener('click', () => goTo(index + 1));
  bubble.querySelector('[data-tut="next"]')?.addEventListener('click', () => goTo(index + 1));
  bubble.querySelector('[data-tut="finish"]')?.addEventListener('click', () => finishLesson());
  bubble.querySelector('[data-tut="nextLesson"]')?.addEventListener('click', () => {
    finishLesson();
    if (nextLesson) startLesson(nextLesson.id);
  });
};

/** 말풍선을 대상 옆(오른쪽 → 왼쪽 → 아래 → 위)에, 화면 밖으로 나가지 않게 둔다 */
const placeBubble = (rect: DOMRect | null) => {
  if (!bubble) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = Math.min(BUBBLE_W, vw - 24);
  const bh = bubble.offsetHeight || 160;
  let x: number;
  let y: number;
  if (!rect) {
    x = (vw - bw) / 2;
    y = (vh - bh) / 2;
  } else if (rect.right + GAP + bw <= vw - 12) {
    x = rect.right + GAP;
    y = rect.top + rect.height / 2 - bh / 2;
  } else if (rect.left - GAP - bw >= 12) {
    x = rect.left - GAP - bw;
    y = rect.top + rect.height / 2 - bh / 2;
  } else if (rect.bottom + GAP + bh <= vh - 12) {
    x = rect.left + rect.width / 2 - bw / 2;
    y = rect.bottom + GAP;
  } else {
    x = rect.left + rect.width / 2 - bw / 2;
    y = rect.top - GAP - bh;
  }
  x = Math.min(vw - bw - 12, Math.max(12, x));
  y = Math.min(vh - bh - 12, Math.max(12, y));
  bubble.style.width = `${bw}px`;
  bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
};

const loop = () => {
  frame = requestAnimationFrame(loop);
  tick();
};

const tick = () => {
  if (!lesson || !spot) return;
  const step = lesson.steps[index];

  let rect: DOMRect | null = null;
  try { rect = step.target?.() ?? null; } catch { rect = null; }
  if (rect && (rect.width <= 0 || rect.height <= 0)) rect = null;
  if (rect) {
    spot.hidden = false;
    spot.style.transform = `translate(${rect.left - PAD}px, ${rect.top - PAD}px)`;
    spot.style.width = `${rect.width + PAD * 2}px`;
    spot.style.height = `${rect.height + PAD * 2}px`;
    spot.classList.toggle('pulse', Boolean(step.done) && completedAt === 0);
    spot.classList.remove('none');
  } else {
    // 강조할 곳이 없으면 화면 전체를 옅게 덮기만 한다
    spot.classList.add('none');
  }
  placeBubble(rect);

  if (step.done && completedAt === 0) {
    let ok = false;
    try { ok = step.done(); } catch { ok = false; }
    if (ok) {
      completedAt = performance.now();
      renderBubble();
    }
  } else if (completedAt && !step.manual && performance.now() - completedAt > ADVANCE_DELAY && index < lesson.steps.length - 1) {
    goTo(index + 1);
  }
};

const goTo = (next: number) => {
  if (!lesson) return;
  index = Math.max(0, Math.min(lesson.steps.length - 1, next));
  completedAt = 0;
  try { lesson.steps[index].onEnter?.(); } catch { /* 준비가 실패해도 안내는 이어 간다 */ }
  renderBubble();
};

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && lesson) stopTutorial();
};

/* ---------- 시작과 끝 ---------- */

export const startLesson = (id: string) => {
  const next = lessons.find(l => l.id === id);
  if (!next) return;
  if (next.setup && next.setup() === false) return;
  if (!lesson) document.addEventListener('keydown', onKey);
  lesson = next;
  ensureElements();
  cancelAnimationFrame(frame);
  window.clearInterval(timer);
  frame = requestAnimationFrame(loop);
  timer = window.setInterval(tick, 120);
  goTo(0);
  emitChange();
};

const finishLesson = () => {
  if (lesson) markFinished(lesson.id);
  stopTutorial();
};

export const stopTutorial = () => {
  cancelAnimationFrame(frame);
  window.clearInterval(timer);
  document.removeEventListener('keydown', onKey);
  lesson = null;
  removeElements();
  emitChange();
};

/* ---------- 강조할 곳을 찾는 도우미 ---------- */

/** CSS 선택자로 찾은 요소의 위치 (숨겨져 있으면 null) */
export const el = (selector: string) => (): DOMRect | null => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node || node.closest('[hidden]') || node.offsetParent === null && getComputedStyle(node).position !== 'fixed') return null;
  return node.getBoundingClientRect();
};

/** 선택자에 맞는 보이는 요소들을 모두 감싸는 사각형 (도구 레일 + 바깥의 이름표 등) */
export const union = (...selectors: string[]) => (): DOMRect | null => {
  const rects = selectors
    .flatMap(selector => [...document.querySelectorAll<HTMLElement>(selector)])
    .filter(node => !node.closest('[hidden]') && getComputedStyle(node).display !== 'none')
    .map(node => node.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  const left = Math.min(...rects.map(r => r.left));
  const top = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.right));
  const bottom = Math.max(...rects.map(r => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
};

/** 여러 후보 중 처음으로 보이는 것 */
export const first = (...targets: (() => DOMRect | null)[]) => (): DOMRect | null => {
  for (const target of targets) {
    const rect = target();
    if (rect) return rect;
  }
  return null;
};

/** 화면 좌표 한 점을 가운데로 하는 정사각형 */
export const around = (x: number, y: number, half = 22) => new DOMRect(x - half, y - half, half * 2, half * 2);
