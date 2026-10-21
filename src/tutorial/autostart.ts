// src/tutorial/autostart.ts
// 홈에 들어온 사람에게 아직 끝내지 않은 첫 강의를 묻지 않고 바로 시작한다 (사용자 결정 2026-10-21).
//   - 로그인한 회원: 처음이면 1강, 1강을 끝냈으면 다음에 들어왔을 때 2강 …  진행 기록은 계정마다 따로.
//   - 로그인 없이 시작한 사람(또는 온라인 설정이 없는 경우): 똑같이 하되 진행 기록은 이 브라우저에 하나로 둔다.
//   - 로그인 화면에서 아직 고르지 않은 사람에게는 시작하지 않는다 (홈이 보일 때만).
//   - 페이지를 열 때마다 한 번만 시도한다. 모든 강의를 끝냈거나 "들어올 때 이어서 하기"를 끈 사람은 시작하지 않는다.
//   - 로그인하면서 하던 작업이 되살아난 경우(편집 화면이 열려 있음)는 건드리지 않는다.
// 사양: docs/tutorial/TUTORIAL_SPEC.md §3

import { getUser, isAuthResolved, onAuthChange, type CloudUser } from '../cloud/auth';
import { isHomeShown, onHomeShown } from '../cloud/home';
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

let triedThisVisit = false;

/**
 * 홈이 보이거나 로그인 상태가 정해질 때마다 부른다. 시험하기 쉽게 따로 내보낸다.
 * homeShown: 지금 홈(로그인 화면이 아닌)이 보이는가
 */
export const maybeAutoStart = (user: CloudUser | null, resolved = isAuthResolved(), homeShown = isHomeShown()): string | null => {
  setProgressScope(user?.id ?? null);
  if (!resolved || !homeShown || triedThisVisit || isTutorialRunning()) return null;
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
  onHomeShown(() => { maybeAutoStart(getUser()); });
  // 온라인 설정이 없으면 홈이 튜토리얼보다 먼저 그려지므로 한 번 확인한다
  maybeAutoStart(getUser());
};
