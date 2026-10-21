// src/tutorial/autostart.ts
// 로그인한 회원이 들어오면(홈이 보일 때) 아직 끝내지 않은 첫 강의를 묻지 않고 바로 시작한다 (사용자 결정 2026-10-21).
//   - 처음 로그인한 사람은 1강부터, 1강을 끝낸 사람은 다음에 들어왔을 때 2강부터 …
//   - 페이지를 열 때마다 한 번만 시도한다. 모든 강의를 끝냈거나 "들어올 때 이어서 하기"를 끈 사람은 시작하지 않는다.
//   - 진행 기록은 계정마다 따로 둔다 (engine.setProgressScope).
//   - 로그인하면서 하던 작업이 되살아난 경우(편집 화면이 열려 있음)는 건드리지 않는다.
// 사양: docs/tutorial/TUTORIAL_SPEC.md §3

import { isAuthResolved, onAuthChange, type CloudUser } from '../cloud/auth';
import { finishedLessons, getLessons, isTutorialRunning, setProgressScope, startLesson } from './engine';

const AUTO_OFF_KEY = 'lightingAid.tutorial.autoContinueOff';

export const isAutoContinueOn = () => { try { return localStorage.getItem(AUTO_OFF_KEY) !== '1'; } catch { return true; } };
export const setAutoContinue = (on: boolean) => {
  try { if (on) localStorage.removeItem(AUTO_OFF_KEY); else localStorage.setItem(AUTO_OFF_KEY, '1'); } catch { /* 이번만 */ }
};

/** 아직 끝내지 않은 첫 강의 (모두 끝냈으면 null) */
export const nextUnfinishedLesson = () => {
  const done = finishedLessons();
  return getLessons().find(lesson => !done.has(lesson.id)) ?? null;
};

const homeVisible = () => document.getElementById('landing-screen')?.style.display !== 'none';

let triedThisVisit = false;

/** 로그인 상태가 정해질 때마다 부른다. 시험하기 쉽게 따로 내보낸다 */
export const maybeAutoStart = (user: CloudUser | null, resolved = isAuthResolved()): string | null => {
  setProgressScope(user?.id ?? null);
  if (!user || !resolved || triedThisVisit || isTutorialRunning()) return null;
  if (!homeVisible()) return null;
  triedThisVisit = true;
  if (!isAutoContinueOn()) return null;
  const lesson = nextUnfinishedLesson();
  if (!lesson) return null;
  // 홈이 그려진 다음에 편집 화면으로 넘어가도록 한 박자 늦춘다
  window.setTimeout(() => startLesson(lesson.id), 0);
  return lesson.id;
};

export const initTutorialAutostart = () => {
  onAuthChange(user => { maybeAutoStart(user); });
};
