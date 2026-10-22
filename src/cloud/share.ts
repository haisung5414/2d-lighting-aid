// src/cloud/share.ts
// 공유 링크: 주인은 링크를 켜고 끄고 새로 만들고, 링크를 연 사람은 로그인 없이 그 작업을 보기 전용으로 연다.
// 보기 전용 = 조명을 움직여 볼 수는 있지만 원본에는 저장되지 않는다. 내 컴퓨터(JSON)나 자기 계정에 사본으로 저장할 수 있다.
// 사양: docs/cloud/CLOUD_SPEC.md §10

import { loadProjectData } from '../ui/manager';
import { askFileName, getFileState } from '../ui/shell';
import { startSignIn } from './account';
import { getUser } from './auth';
import { appUrl, cloudConfig } from './config';
import { holdHome, onHomeShown } from './home';
import { fetchSharedProject, getOpenRowId, getShareToken, reportError, saveOnline, setShareToken } from './projects';

const SHARE_PARAM = 'share';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export const shareUrl = (token: string) => `${appUrl()}?${SHARE_PARAM}=${token}`;

/* ---------- 창 하나를 돌려 쓴다 ---------- */

let dialog: HTMLDialogElement | null = null;
const openDialog = (...children: Node[]) => {
  if (!dialog) {
    dialog = el('dialog', 'cloud-dialog share-dialog');
    dialog.setAttribute('aria-labelledby', 'share-dialog-title');
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog?.close(); });
    // 창 안에서 누른 키가 도구 단축키로 가지 않게
    dialog.addEventListener('keydown', e => e.stopPropagation());
    document.body.append(dialog);
  }
  dialog.replaceChildren(...children);
  if (!dialog.open) dialog.showModal();
};
const closeDialog = () => dialog?.close();
const title = (text: string) => {
  const node = el('h2', undefined, text);
  node.id = 'share-dialog-title';
  return node;
};
const actions = (...buttons: HTMLElement[]) => {
  const row = el('div', 'cloud-dialog-actions');
  row.append(...buttons);
  return row;
};

/* ---------- 주인: 공유 창 ---------- */

const copyText = async (text: string, input: HTMLInputElement) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 권한이 없으면 칸을 골라 두고 사용자가 복사하게 한다
    input.select();
    return document.execCommand?.('copy') ?? false;
  }
};

/** 온라인 작업 하나의 공유 창. 지금 링크 상태를 받아 와서 그린다 */
export const openShareDialog = async (id: string, name: string) => {
  openDialog(title(`"${name}" 공유`), el('p', undefined, '불러오는 중…'));
  let token: string | null;
  try {
    token = await getShareToken(id);
  } catch (err) {
    closeDialog();
    reportError(err);
    return;
  }

  const render = () => {
    const toggle = el('input') as HTMLInputElement;
    toggle.type = 'checkbox';
    toggle.checked = !!token;
    const toggleRow = el('label', 'share-toggle');
    toggleRow.append(toggle, el('span', undefined, '링크가 있는 사람은 누구나 볼 수 있음'));
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      const next = toggle.checked ? crypto.randomUUID() : null;
      try {
        await setShareToken(id, next);
        token = next;
      } catch (err) {
        reportError(err);
      }
      render();
    });

    const parts: Node[] = [title(`"${name}" 공유`), toggleRow];
    if (token) {
      const link = el('input', 'share-link') as HTMLInputElement;
      link.type = 'text';
      link.readOnly = true;
      link.value = shareUrl(token);
      link.setAttribute('aria-label', '공유 링크');
      link.addEventListener('focus', () => link.select());
      const copy = button('cloud-google-btn share-copy', '링크 복사', async () => {
        const ok = await copyText(link.value, link);
        copy.textContent = ok ? '복사했습니다' : '칸을 골라 직접 복사해 주세요';
        window.setTimeout(() => { copy.textContent = '링크 복사'; }, 2000);
      });
      const linkRow = el('div', 'share-link-row');
      linkRow.append(link, copy);
      const renew = button('cloud-text-btn share-renew', '새 링크 만들기', async () => {
        if (!window.confirm('새 링크를 만들면 지금 링크로는 더 이상 열 수 없습니다. 새로 만들까요?')) return;
        const next = crypto.randomUUID();
        try {
          await setShareToken(id, next);
          token = next;
        } catch (err) {
          reportError(err);
        }
        render();
      });
      parts.push(linkRow, renew);
    }
    parts.push(
      el('p', 'share-note', '링크로 연 사람은 조명을 움직여 볼 수 있지만 이 작업에는 저장되지 않습니다. 내 컴퓨터나 자기 계정에 사본으로 저장할 수 있습니다. 링크는 마지막으로 저장한 상태를 보여 줍니다.'),
      actions(button('cloud-text-btn', '닫기', closeDialog)),
    );
    openDialog(...parts);
  };
  render();
};

/** 편집 화면의 공유 버튼: 지금 작업이 온라인에 저장되어 있어야 공유할 수 있다 */
const shareCurrentWork = () => {
  if (!getUser()) {
    openDialog(
      title('공유'),
      el('p', undefined, '공유하려면 로그인해야 합니다. 로그인한 뒤 작업을 온라인에 저장하면 링크를 만들 수 있습니다.'),
      actions(button('cloud-text-btn', '닫기', closeDialog), button('cloud-google-btn', '로그인', () => { closeDialog(); startSignIn(); })),
    );
    return;
  }
  const { name, location } = getFileState();
  const id = getOpenRowId();
  if (location === 'cloud' && id && name) {
    void openShareDialog(id, name);
    return;
  }
  const saveThenShare = () => {
    closeDialog();
    const go = async (fileName: string) => {
      if (!(await saveOnline(fileName, location !== 'cloud'))) return;
      const savedId = getOpenRowId();
      if (savedId) void openShareDialog(savedId, fileName);
    };
    if (name) void go(name);
    else askFileName(newName => void go(newName));
  };
  openDialog(
    title('공유'),
    el('p', undefined, '공유하려면 먼저 온라인에 저장해야 합니다. 링크는 온라인에 저장한 작업에만 만들 수 있습니다.'),
    actions(button('cloud-text-btn', '닫기', closeDialog), button('cloud-google-btn', '온라인에 저장', saveThenShare)),
  );
};

/* ---------- 링크를 연 사람: 보기 전용 ---------- */

let banner: HTMLElement | null = null;
let bannerJustShown = false;

const hideBanner = () => {
  banner?.remove();
  banner = null;
};

const showBanner = (ownerName: string | null) => {
  hideBanner();
  banner = el('div', 'float share-banner');
  banner.setAttribute('role', 'status');
  const text = el('div', 'share-banner-text');
  text.append(
    el('b', undefined, ownerName ? `${ownerName} 님이 공유한 작업 · 보기 전용` : '공유받은 작업 · 보기 전용'),
    el('span', undefined, '조명을 움직여 볼 수 있지만 원본에는 저장되지 않습니다. 남기려면 ☰ 메뉴에서 저장하세요.'),
  );
  const close = button('ibtn share-banner-close', '✕', hideBanner);
  close.setAttribute('aria-label', '안내 닫기');
  banner.append(text, close);
  document.getElementById('canvas-wrapper')?.append(banner);
};

const removeShareParam = () => {
  const url = new URL(location.href);
  if (!url.searchParams.has(SHARE_PARAM)) return;
  url.searchParams.delete(SHARE_PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
};

/** 주소에 ?share=가 있으면 그 작업을 연다. 여는 동안 홈(로그인 화면·튜토리얼)을 붙잡아 둔다 */
const openSharedFromUrl = async () => {
  const token = new URLSearchParams(location.search).get(SHARE_PARAM);
  if (!token) return;
  if (!UUID.test(token)) {
    removeShareParam();
    alert('이 공유 링크는 열 수 없습니다. 주소가 잘렸거나 잘못되었을 수 있습니다.');
    return;
  }
  holdHome(true);
  try {
    const shared = await fetchSharedProject(token);
    if (!shared) {
      removeShareParam();
      alert('이 공유 링크는 열 수 없습니다. 주인이 공유를 껐거나 새 링크로 바꿨을 수 있습니다.');
      return;
    }
    loadProjectData(shared.data, shared.name);
    // 이 컴퓨터에는 아직 저장되지 않았다: 저장은 내 컴퓨터(또는 로그인했으면 자기 계정)로 간다
    bannerJustShown = true;
    window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name: shared.name, location: 'local', dirty: true } }));
    bannerJustShown = false;
    showBanner(shared.owner_name);
  } catch (err) {
    removeShareParam();
    reportError(err);
  } finally {
    holdHome(false);
  }
};

export const initShare = () => {
  const shareButton = document.getElementById('share-btn') as HTMLButtonElement | null;
  if (!cloudConfig) return;
  if (shareButton) {
    shareButton.disabled = false;
    shareButton.title = '링크로 공유';
    shareButton.addEventListener('click', shareCurrentWork);
  }
  // 다른 작업을 열거나 저장하면 "보기 전용" 안내를 걷는다
  window.addEventListener('lighting:file', () => { if (!bannerJustShown) hideBanner(); });
  // 홈으로 돌아가면 주소의 ?share=를 지운다 (새로고침해도 다시 열리지 않게)
  onHomeShown(() => { hideBanner(); removeShareParam(); });
  void openSharedFromUrl();
};
