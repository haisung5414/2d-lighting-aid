// src/cloud/account.ts
// 편집 화면 오른쪽 위 계정 자리(로그인 버튼 ↔ 계정 칩과 메뉴)와 저장 안 된 작업 경고 창. 시작 화면(로그인·홈)은 home.ts가 그린다.
// 사양: docs/cloud/CLOUD_SPEC.md §4.1, §4.4

import { onAuthChange, signInWithGoogle, signOut, type CloudUser } from './auth';
import { cloudConfig } from './config';
import { getFileState } from '../ui/shell';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const button = (className: string, text: string, onClick: () => void) => {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
};

export const avatar = (user: CloudUser) => {
  if (user.avatarUrl) {
    const img = el('img', 'cloud-avatar');
    img.src = user.avatarUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer'; // Google 프로필 사진은 referrer가 있으면 막힐 때가 있다
    return img;
  }
  return el('span', 'cloud-avatar cloud-avatar-letter', user.name.charAt(0).toUpperCase());
};

/* ---------- 로그인 경고 창 ---------- */

let warnDialog: HTMLDialogElement | null = null;

/** 저장하지 않은 변경이 있으면 사라진다고 알린 뒤 로그인한다. 변경이 없으면 바로 Google 로그인으로 간다 (CLOUD_SPEC §4.4) */
export const startSignIn = () => {
  if (!getFileState().dirty) {
    void signInWithGoogle();
    return;
  }
  if (!warnDialog) {
    const dialog = el('dialog', 'cloud-dialog');
    dialog.setAttribute('aria-labelledby', 'cloud-signin-title');
    const title = el('h2', undefined, '저장하지 않은 작업이 있습니다');
    title.id = 'cloud-signin-title';
    const text = el('p', undefined, '로그인하면 Google 로그인 화면으로 넘어갔다가 홈으로 돌아옵니다. 지금 작업에서 저장하지 않은 내용은 사라집니다. 남기려면 먼저 ☰ 메뉴에서 저장해 주세요.');
    const google = button('cloud-google-btn cloud-warn-btn', '저장하지 않고 로그인', () => {
      google.disabled = true;
      void signInWithGoogle().finally(() => { google.disabled = false; });
    });
    const actions = el('div', 'cloud-dialog-actions');
    actions.append(button('cloud-text-btn', '취소', () => dialog.close()), google);
    dialog.append(title, text, actions);
    // 바깥(배경)을 누르면 닫는다
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    // 창 안에서 누른 키가 도구 단축키로 가지 않게
    dialog.addEventListener('keydown', e => e.stopPropagation());
    document.body.append(dialog);
    warnDialog = dialog;
  }
  warnDialog.showModal();
};

/* ---------- 오른쪽 위 계정 자리 ---------- */

let accountChip: HTMLButtonElement | null = null;
let accountMenu: HTMLDivElement | null = null;
let accountEmail: HTMLDivElement | null = null;

const closeAccountMenu = () => {
  if (accountMenu) accountMenu.hidden = true;
  accountChip?.setAttribute('aria-expanded', 'false');
};

const renderAccount = (user: CloudUser | null) => {
  const loginButton = document.getElementById('login-btn');
  if (!accountChip || !loginButton) return;
  loginButton.hidden = !!user;
  accountChip.hidden = !user;
  closeAccountMenu();
  if (!user) return;
  accountChip.replaceChildren(avatar(user), el('span', 'cloud-chip-name', user.name));
  accountChip.title = user.email;
  if (accountEmail) accountEmail.textContent = user.email;
};

const initAccountArea = () => {
  const loginButton = document.getElementById('login-btn') as HTMLButtonElement | null;
  if (!loginButton) return;

  if (!cloudConfig) {
    loginButton.title = '온라인 저장이 설정되지 않았습니다';
    return;
  }
  loginButton.disabled = false;
  loginButton.title = '로그인';
  loginButton.classList.add('cloud-login-btn');
  loginButton.addEventListener('click', startSignIn);

  const chip = el('button', 'pillbtn cloud-chip');
  chip.type = 'button';
  chip.hidden = true;
  chip.setAttribute('aria-haspopup', 'true');
  chip.setAttribute('aria-expanded', 'false');
  const menu = el('div', 'float cloud-menu');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  accountEmail = el('div', 'cloud-menu-email');
  const signOutItem = button('', '로그아웃', () => { closeAccountMenu(); void signOut(); });
  signOutItem.setAttribute('role', 'menuitem');
  menu.append(accountEmail, signOutItem);
  const wrap = el('div', 'cloud-account-wrap');
  wrap.append(chip, menu);
  loginButton.after(wrap);
  accountChip = chip;
  accountMenu = menu;

  chip.addEventListener('click', e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    chip.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', e => {
    if (!(e.target as HTMLElement).closest('.cloud-account-wrap')) closeAccountMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAccountMenu(); });
};

export const initAccountUI = () => {
  initAccountArea();
  onAuthChange(renderAccount);
};
