// src/ui/help.ts
// "도우미" 패널: 지금 도구의 이름·단축키·사용법과 다음에 일어나는 일, 그리고 단축키 목록.
// 도구를 바꾸면 내용이 따라 바뀐다. 상태 바 왼쪽의 ? 아이콘으로도 연다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §5.1, §7

import { getToolHelp, onToolChange } from './tools';

const KEYS: [string, string][] = [
  ['Space', '선택'],
  ['E', '엘립소이달 놓기 (마지막 렌즈)'],
  ['F', '프레넬 놓기'],
  ['P', 'PAR 놓기'],
  ['R', '세트 그리기'],
  ['W · D · B', '벽 · 덧마루 · 애플박스'],
  ['A', '사람 모형 놓기'],
  ['두 번 누르기', '조명 설정 / 선택한 객체 속성 열기'],
  ['Esc', '선택 도구로 돌아가기'],
  ['Ctrl+Z · Ctrl+Y', '실행 취소 · 다시 실행'],
  ['휠', '확대 · 축소'],
  ['숫자 + Enter', '끈 직후 거리, 세트를 놓은 직후 높이 (mm)']
];

const renderHelp = () => {
  const body = document.getElementById('help-body');
  if (!body) return;
  const help = getToolHelp();
  body.innerHTML = `
    <div class="help-tool"><b>${help.name}</b>${help.view3D ? '' : `<kbd>${help.keyLabel}</kbd>`}</div>
    <p class="help-hint">${help.hint}</p>
    <div class="pp-sub">다음에 일어나는 일</div>
    <p class="pp-note">${help.next}</p>
    <div class="pp-sub">단축키</div>
    <dl class="help-keys">${KEYS.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl>`;
};

export const initHelp = () => {
  onToolChange(renderHelp);
  renderHelp();
};
