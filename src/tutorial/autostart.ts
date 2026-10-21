// src/tutorial/autostart.ts
// 처음 로그인한 사람에게는 묻지 않고 바로 1강을 시작한다 (사용자 결정 2026-10-21).
// "처음"은 이 브라우저에서 그 계정으로 튜토리얼을 자동 시작한 적이 없는 경우다 (localStorage에 계정 id를 남긴다).
// 로그인한 뒤 홈이 보일 때만 시작한다. 로그인하면서 하던 작업이 되살아난 경우(편집 화면)는 건드리지 않는다.
// 사양: docs/tutorial/TUTORIAL_SPEC.md §3

import { isAuthResolved, onAuthChange } from '../cloud/auth';
import { isTutorialRunning, startLesson } from './engine';

const AUTO_KEY = 'lightingAid.tutorial.autoStartedUsers';

const startedUsers = (): string[] => {
  try { return JSON.parse(localStorage.getItem(AUTO_KEY) ?? '[]') as string[]; } catch { return []; }
};
const rememberUser = (id: string) => {
  const ids = startedUsers();
  if (ids.includes(id)) return;
  ids.push(id);
  try { localStorage.setItem(AUTO_KEY, JSON.stringify(ids)); } catch { /* 저장 못 하면 다음에 또 시작될 수 있다 */ }
};

const homeVisible = () => document.getElementById('landing-screen')?.style.display !== 'none';

export const initTutorialAutostart = () => {
  onAuthChange(user => {
    if (!user || !isAuthResolved() || isTutorialRunning()) return;
    if (startedUsers().includes(user.id) || !homeVisible()) return;
    rememberUser(user.id);
    // 홈이 그려진 다음에 편집 화면으로 넘어가도록 한 박자 늦춘다
    window.setTimeout(() => startLesson('tour'), 0);
  });
};
