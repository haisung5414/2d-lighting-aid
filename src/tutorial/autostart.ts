// src/tutorial/autostart.ts
// 홈에서 새 작업을 시작한 사람에게 아직 끝내지 않은 첫 강의를 묻지 않고 바로 시작한다 (사용자 결정 2026-10-26).
//   - 시작 화면과 홈(내 작업 목록)은 그대로 거친다. 기존 작업을 열 때는 시작하지 않는다.
//   - 로그인한 회원: 처음이면 1강, 1강을 끝냈으면 다음에 새 작업을 만들 때 2강 …  진행 기록은 계정마다 따로.
//   - 로그인 없이 시작한 사람(또는 온라인 설정이 없는 경우): 똑같이 하되 진행 기록은 이 브라우저에 하나로 둔다.
//   - 페이지를 열 때마다 한 번만 시작한다. 모든 강의를 끝냈거나 "이어서 하기"를 끈 사람은 시작하지 않는다.
//   - 강의는 연습용 작업에서 하므로, 끝내기나 그만하기를 누르면 방금 만든 빈 새 작업(고른 극장)으로 돌려놓는다.
//     "다음 강의"로 이어 가는 동안이나, 그 사이 다른 작업을 열었으면 돌려놓지 않는다.
// 사양: docs/tutorial/TUTORIAL_SPEC.md §3

import { getUser, onAuthChange, type CloudUser } from '../cloud/auth';
import { onNewWorkStarted } from '../cloud/home';
import { markNewWork } from '../cloud/projects';
import { initVenue } from '../state/store';
import { resetCanvasZoom } from '../render/canvas';
import { openPanel, setViewMode } from '../ui/shell';
import { setTool } from '../ui/tools';
import type { VenueKey } from '../config/venues';
import { finishedLessons, getLessons, isTutorialRunning, onTutorialChange, setProgressScope, startLesson } from './engine';
import { forgetPractice, isPracticeOpen } from './lessons';

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
/** 자동 시작한 튜토리얼이 끝나면 돌려놓을 새 작업의 극장 */
let returnTo: VenueKey | null = null;

/**
 * 홈에서 새 작업을 시작할 때 부른다. 시험하기 쉽게 따로 내보낸다.
 * 시작한 강의 id (시작하지 않으면 null)
 */
export const maybeAutoStart = (user: CloudUser | null, venue: VenueKey): string | null => {
  setProgressScope(user?.id ?? null);
  if (triedThisVisit || isTutorialRunning()) return null;
  triedThisVisit = true;
  if (!isAutoContinueOn()) return null;
  const lesson = nextUnfinishedLesson();
  if (!lesson) return null;
  // 새 작업의 편집 화면이 그려진 다음에 연습용 작업으로 바꾼다
  window.setTimeout(() => {
    startLesson(lesson.id);
    if (isTutorialRunning()) returnTo = venue;
  }, 0);
  return lesson.id;
};

/** 자동 시작한 튜토리얼이 끝났으면 원래 고른 극장의 빈 새 작업으로 돌려놓는다 */
const restoreNewWork = () => {
  if (isTutorialRunning() || !returnTo) return;
  const venue = returnTo;
  returnTo = null;
  if (!isPracticeOpen()) return;
  forgetPractice();
  initVenue(venue);
  markNewWork();
  setTool('select');
  openPanel(null);
  void setViewMode('2d');
  resetCanvasZoom();
};

export const initTutorialAutostart = () => {
  onAuthChange(user => { setProgressScope(user?.id ?? null); });
  onNewWorkStarted(venue => { maybeAutoStart(getUser(), venue); });
  onTutorialChange(restoreNewWork);
  setProgressScope(getUser()?.id ?? null);
};
