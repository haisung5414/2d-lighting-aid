// src/tutorial/index.ts
// 튜토리얼의 시작점: 강의를 등록하고, 도우미 패널에 강의 목록과 시작 버튼을 그린다.
// 사양: docs/tutorial/TUTORIAL_SPEC.md §3

import { finishedLessons, getLessons, isTutorialRunning, onTutorialChange, registerLessons, startLesson } from './engine';
import { LESSONS } from './lessons';
import { initTutorialAutostart, isAutoContinueOn, setAutoContinue } from './autostart';

const renderList = () => {
  const host = document.getElementById('tutorial-list');
  if (!host) return;
  const done = finishedLessons();
  host.innerHTML = getLessons().map(lesson => `
    <div class="tut-row">
      <span class="tut-check" aria-label="${done.has(lesson.id) ? '마침' : ''}">${done.has(lesson.id) ? '✓' : ''}</span>
      <span class="tut-name">${lesson.title}<small>${lesson.summary}</small></span>
      <button type="button" class="sbtn" data-lesson="${lesson.id}" ${isTutorialRunning() ? 'disabled' : ''}>${done.has(lesson.id) ? '다시 하기' : '시작'}</button>
    </div>`).join('');
  host.querySelectorAll<HTMLButtonElement>('[data-lesson]').forEach(button => {
    button.addEventListener('click', () => startLesson(button.dataset.lesson!));
  });
  const auto = document.getElementById('tutorial-auto') as HTMLInputElement | null;
  if (auto) auto.checked = isAutoContinueOn();
};

export const initTutorial = () => {
  registerLessons(LESSONS);
  document.getElementById('tutorial-auto')?.addEventListener('change', e => setAutoContinue((e.target as HTMLInputElement).checked));
  onTutorialChange(renderList);
  renderList();
  initTutorialAutostart();
};
