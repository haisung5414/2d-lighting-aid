// src/cloud/fileMenu.ts
// 위쪽 바 ☰ 메뉴에 온라인 항목을 더한다: 온라인에 저장 (내 컴퓨터 작업일 때), 내 컴퓨터에 내려받기 (온라인 작업일 때).
// 둘 다 로그인했을 때만 보인다. 저장 / 다른 이름으로 저장은 ui/shell.ts가 저장 위치에 따라 이 모듈의 saveOnline을 부른다.
// 사양: docs/cloud/CLOUD_SPEC.md §5.1

import { askFileName, getFileState, setCloudSaveHandler } from '../ui/shell';
import { getUser, onAuthChange } from './auth';
import { downloadCurrent, saveOnline } from './projects';

const items: { saveOnline?: HTMLButtonElement; download?: HTMLButtonElement } = {};

const menuItem = (label: string, onClick: () => void) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.setAttribute('role', 'menuitem');
  item.textContent = label;
  item.addEventListener('click', () => {
    const menu = document.getElementById('file-menu');
    if (menu) menu.hidden = true;
    document.getElementById('file-menu-btn')?.setAttribute('aria-expanded', 'false');
    onClick();
  });
  return item;
};

const render = () => {
  const signedIn = !!getUser();
  const { location } = getFileState();
  if (items.saveOnline) items.saveOnline.hidden = !signedIn || location === 'cloud';
  if (items.download) items.download.hidden = !signedIn || location !== 'cloud';
};

export const initFileMenu = () => {
  setCloudSaveHandler((name, asNew) => void saveOnline(name, asNew));

  const saveAs = document.querySelector('#file-menu [data-menu="saveas"]');
  if (!saveAs) return;
  items.saveOnline = menuItem('온라인에 저장', () => {
    const { name } = getFileState();
    if (name) void saveOnline(name, true);
    else askFileName(newName => void saveOnline(newName, true));
  });
  items.download = menuItem('내 컴퓨터에 내려받기', downloadCurrent);
  saveAs.after(items.saveOnline, items.download);

  window.addEventListener('lighting:file', render);
  onAuthChange(render);
};
