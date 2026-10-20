// src/cloud/home.ts
// 시작 화면 자리(#landing-screen)에 그리는 두 화면: 로그인 화면과 홈(극장에서 시작 + 내 작업).
// SketchUp Web의 로그인 페이지와 홈 허브를 따른다. 시안: docs/design/sketchup-redesign/Login.dc.html, Home.dc.html
// 예전 작업 공간 카드(.landing-card)는 DOM에 남아 있지만 home.css가 감춘다. 화면 전환(시작 화면 ↔ 편집 화면)은 기존 코드 그대로 쓴다.
// 사양: docs/cloud/CLOUD_SPEC.md §4.1, §4.2, §9

import './home.css';
import { initVenue } from '../state/store';
import { VENUES, type VenueKey } from '../config/venues';
import { avatar } from './account';
import { getUser, hasSkippedLogin, isAuthResolved, onAuthChange, setSkippedLogin, signInWithGoogle, signOut, type CloudUser } from './auth';
import { cloudConfig } from './config';
import {
  deleteProject, downloadProject, listProjects, markNewWork, NETWORK_MESSAGE, onProjectsChange, openProject, renameProject,
  type ProjectSummary,
} from './projects';

/* ---------- 작은 도우미 ---------- */

type Child = Node | string | null | undefined | false;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Child[]) => {
  const node = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) node.className = className;
  Object.assign(node, rest);
  for (const child of children) if (child) node.append(child);
  return node;
};
/** 정해진 SVG 문자열만 넣는다 (사용자 입력은 넣지 않는다) */
const icon = (svg: string) => {
  const span = h('span', { class: 'lh-icon', ariaHidden: 'true' });
  span.innerHTML = svg;
  return span;
};
const button = (className: string, label: Child, onClick: (e: MouseEvent) => void, extra: Partial<HTMLButtonElement> = {}) => {
  const node = h('button', { class: className, type: 'button', ...extra }, label);
  node.addEventListener('click', onClick);
  return node;
};

const readPref = (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* 이번 세션만 */ } };

const SVG = {
  logo: '<svg viewBox="0 0 32 32" width="32" height="32"><rect x="10" y="3" width="12" height="9" rx="1" fill="currentColor"/><path d="M12 12 5 29h22l-7-17z" fill="currentColor" opacity=".35"/></svg>',
  google: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853"/><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.6z" fill="#FBBC05"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z" fill="#EA4335"/></svg>',
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z"/></svg>',
  info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  sort: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4v16M3 17l3 3 3-3M12 6h9M12 10h7M12 14h5M12 18h3"/></svg>',
  list: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="4" height="4"/><rect x="3" y="10" width="4" height="4"/><rect x="3" y="16" width="4" height="4"/><path d="M10 6h11M10 12h11M10 18h11"/></svg>',
  grid: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>',
  cloud: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
  person: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  stage: '<svg viewBox="0 0 240 110" preserveAspectRatio="xMidYMid meet"><rect x="80" y="15" width="80" height="80" fill="var(--lh-tile-fill)" stroke="var(--lh-tile-line)" stroke-dasharray="5 4"/></svg>',
  emptyThumb: '<svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid meet"><rect x="95" y="20" width="110" height="110" fill="none" stroke="#5b6878" stroke-dasharray="5 4"/><ellipse cx="150" cy="75" rx="30" ry="26" fill="#F5B841" opacity=".35"/></svg>',
  hero: `<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
    <ellipse cx="330" cy="250" rx="300" ry="210" fill="var(--lh-hero-1)"/>
    <ellipse cx="330" cy="250" rx="170" ry="120" fill="var(--lh-hero-2)" opacity=".55"/>
    <ellipse cx="420" cy="270" rx="150" ry="110" fill="#F5B841" opacity=".18"/>
    <rect x="320" y="40" width="24" height="24" fill="none" stroke="var(--lh-blue)" stroke-width="2"/>
    <line x1="332" y1="64" x2="332" y2="250" stroke="var(--lh-blue)" stroke-dasharray="4 5"/>
    <circle cx="332" cy="250" r="6" fill="none" stroke="#D93025" stroke-width="2"/>
    <rect x="640" y="90" width="18" height="18" fill="none" stroke="var(--lh-faint)"/>
    <rect x="560" y="420" width="40" height="40" fill="var(--lh-faint-fill)"/>
    <circle cx="110" cy="80" r="6" fill="none" stroke="var(--lh-faint)"/>
    <path d="M700 300h30M715 285v30" stroke="var(--lh-faint)"/>
    <rect x="150" y="470" width="12" height="12" fill="none" stroke="#F5B841" stroke-width="2"/>
  </svg>`,
};

const privacyUrl = () => `${import.meta.env.BASE_URL}privacy.html`;

/** 극장 이름: Sandbox는 홈에서 "빈 무대"로 보인다 */
const venueLabel = (key: string | null | undefined) => {
  if (!key) return '';
  if (key === 'sandbox') return '빈 무대';
  return (VENUES as Record<string, { label: string }>)[key]?.label ?? key;
};

const formatUpdated = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const seconds = (now.getTime() - date.getTime()) / 1000;
  if (seconds < 60) return '방금 전';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return `${Math.floor(seconds / 3600)}시간 전`;
  if (date.getTime() >= startOfToday - 86400_000) return '어제';
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
};

/* ---------- 상태 ---------- */

let root: HTMLDivElement;
let loginView: HTMLElement;
let homeView: HTMLElement;
let accountSlot: HTMLElement;
let filesSlot: HTMLElement;
let filesHeading: HTMLElement;
let sortButton: HTMLButtonElement;
let viewButton: HTMLButtonElement;

let projects: ProjectSummary[] | null = null;
let listState: 'idle' | 'loading' | 'error' = 'idle';
let listToken = 0;
let sortMode = readPref('lightingAid.home.sort', 'recent') as 'recent' | 'name';
let viewMode = readPref('lightingAid.home.view', 'grid') as 'grid' | 'list';
/** 로그인 상태 확인이 너무 오래 걸리면 기다리지 않고 홈을 보인다 */
let gaveUpWaiting = false;

const landing = () => document.getElementById('landing-screen');
const landingVisible = () => landing()?.style.display !== 'none';

/* ---------- 열린 팝업 메뉴 하나만 ---------- */

let openPopup: { menu: HTMLElement; anchor: HTMLElement } | null = null;
const closePopup = () => {
  if (!openPopup) return;
  openPopup.menu.hidden = true;
  openPopup.anchor.setAttribute('aria-expanded', 'false');
  openPopup = null;
};
const togglePopup = (anchor: HTMLElement, menu: HTMLElement) => {
  const wasOpen = openPopup?.menu === menu;
  closePopup();
  if (wasOpen) return;
  menu.hidden = false;
  anchor.setAttribute('aria-expanded', 'true');
  openPopup = { menu, anchor };
};
const popupMenu = (items: [label: string, action: () => void, danger?: boolean][]) => {
  const menu = h('div', { class: 'lh-popup', role: 'menu', hidden: true });
  for (const [label, action, danger] of items) {
    menu.append(button(danger ? 'lh-danger' : '', label, (e) => { e.stopPropagation(); closePopup(); action(); }, { role: 'menuitem' } as Partial<HTMLButtonElement>));
  }
  return menu;
};

/* ---------- 새 작업 ---------- */

const startNewWork = (key: VenueKey) => {
  closePopup();
  initVenue(key);
  markNewWork();
};

const openLocalFile = () => {
  closePopup();
  document.getElementById('file-upload')?.click();
};

/* ---------- 로그인 화면 ---------- */

const buildLogin = () => {
  const hero = h('section', { class: 'lh-hero' },
    icon(SVG.hero),
    h('div', { class: 'lh-hero-text' },
      h('span', { class: 'lh-hero-line' }, '무대 조명을'),
      h('span', { class: 'lh-hero-line lh-strong' }, '미리 그려 보세요.'),
      h('span', { class: 'lh-hero-rule' })));

  const google = button('lh-google', null, () => {
    google.disabled = true;
    void signInWithGoogle().finally(() => { google.disabled = false; });
  });
  google.append(icon(SVG.google), 'Google로 계속 진행');

  const skip = button('lh-link', '로그인 없이 시작하기 (이 기기에 저장)', () => {
    setSkippedLogin(true);
    render();
  });

  const panel = h('section', { class: 'lh-signin' },
    h('div', { class: 'lh-brand' }, icon(SVG.logo), h('span', {}, 'Lighting Aid')),
    h('p', { class: 'lh-sub' }, '조명 시뮬레이터'),
    h('h1', {}, '환영합니다'),
    h('p', { class: 'lh-lead' }, 'Google 계정으로 로그인하면 작업을 온라인에 저장하고 어느 컴퓨터에서나 이어서 할 수 있습니다.'),
    google,
    skip,
    h('div', { class: 'lh-grow' }),
    h('div', { class: 'lh-foot' }, h('a', { href: privacyUrl(), target: '_blank', rel: 'noopener' }, '개인정보처리방침')));

  return h('div', { class: 'lh-login', hidden: true }, hero, panel);
};

/* ---------- 홈 ---------- */

const venueCard = (key: VenueKey) => {
  const venue = VENUES[key];
  const thumb = h('div', { class: 'lh-venue-thumb' });
  if (venue.venueMap) {
    thumb.append(h('img', { src: `${import.meta.env.BASE_URL}venues/humanities/humanities_floor_plan.png`, alt: '', loading: 'lazy' }));
  } else {
    thumb.append(icon(SVG.stage));
  }
  const card = button('lh-card lh-venue', null, () => startNewWork(key), { title: `${venueLabel(key)}에서 새 작업 시작` });
  card.append(thumb,
    h('span', { class: 'lh-card-title' }, venueLabel(key)),
    h('span', { class: 'lh-meta' }, `${venue.stage.width} × ${venue.stage.depth} m`));
  return card;
};

const venueKeys = (): VenueKey[] => {
  const keys = Object.keys(VENUES) as VenueKey[];
  // 실제 극장을 먼저, 빈 무대를 뒤에
  return keys.sort((a, b) => Number(!VENUES[a].venueMap) - Number(!VENUES[b].venueMap));
};

const buildHome = () => {
  const nav = h('nav', { class: 'lh-nav', ariaLabel: '홈 메뉴' },
    h('div', { class: 'lh-brand' }, icon(SVG.logo), h('span', {}, 'Lighting Aid')),
    h('a', { class: 'lh-nav-item lh-on', href: '#', ariaCurrent: 'page' } as Partial<HTMLAnchorElement>, icon(SVG.home), '홈'),
    h('div', { class: 'lh-grow' }),
    h('a', { class: 'lh-nav-item', href: privacyUrl(), target: '_blank', rel: 'noopener' }, icon(SVG.info), '개인정보처리방침'));
  nav.querySelector('.lh-on')?.addEventListener('click', e => e.preventDefault());

  accountSlot = h('div', { class: 'lh-account' });

  // 새로 만들기 ▾
  const newMenu = popupMenu(venueKeys().map(key => [`${venueLabel(key)} (${VENUES[key].stage.width} × ${VENUES[key].stage.depth} m)`, () => startNewWork(key)]));
  const newButton = button('lh-outline lh-new', null, (e) => { e.stopPropagation(); togglePopup(newButton, newMenu); },
    { ariaHasPopup: 'true', ariaExpanded: 'false' } as Partial<HTMLButtonElement>);
  newButton.append('새로 만들기', icon(SVG.chevron));

  sortButton = button('lh-iconbtn', icon(SVG.sort), () => {
    sortMode = sortMode === 'recent' ? 'name' : 'recent';
    writePref('lightingAid.home.sort', sortMode);
    renderFiles();
  });
  viewButton = button('lh-iconbtn', null, () => {
    viewMode = viewMode === 'grid' ? 'list' : 'grid';
    writePref('lightingAid.home.view', viewMode);
    renderFiles();
  });

  const actions = h('div', { class: 'lh-actions' },
    h('div', { class: 'lh-popup-wrap' }, newButton, newMenu),
    button('lh-outline', '기기에서 열기', openLocalFile, { title: '내 컴퓨터에 저장한 JSON 작업 파일을 엽니다' }),
    h('div', { class: 'lh-grow' }),
    sortButton,
    viewButton);

  const venues = h('div', { class: 'lh-venues' }, ...venueKeys().map(venueCard));
  filesHeading = h('h2', {}, '내 작업');
  filesSlot = h('div', { class: 'lh-files-slot' });

  const main = h('main', { class: 'lh-main' },
    h('header', { class: 'lh-header' }, h('h1', {}, '홈'), accountSlot),
    actions,
    h('section', { class: 'lh-section' }, h('h2', {}, '극장에서 시작'), venues),
    h('section', { class: 'lh-section' }, filesHeading, filesSlot));

  return h('div', { class: 'lh-home', hidden: true }, nav, main);
};

const renderAccount = (user: CloudUser | null) => {
  accountSlot.replaceChildren();
  if (user) {
    const menu = h('div', { class: 'lh-popup lh-popup-right', role: 'menu', hidden: true },
      h('div', { class: 'lh-popup-email' }, user.email),
      button('', '로그아웃', (e) => { e.stopPropagation(); closePopup(); void signOut(); }, { role: 'menuitem' } as Partial<HTMLButtonElement>));
    const chip = button('lh-chip', null, (e) => { e.stopPropagation(); togglePopup(chip, menu); },
      { title: user.email, ariaHasPopup: 'true', ariaExpanded: 'false' } as Partial<HTMLButtonElement>);
    chip.append(avatar(user), h('span', { class: 'lh-chip-name' }, user.name));
    accountSlot.append(h('div', { class: 'lh-popup-wrap' }, chip, menu));
  } else if (cloudConfig) {
    const signIn = button('lh-outline lh-small', null, () => void signInWithGoogle());
    signIn.append(icon(SVG.person), '로그인');
    accountSlot.append(signIn);
  }
};

/* ---------- 내 작업 ---------- */

const fileThumb = (project: ProjectSummary) => {
  const box = h('div', { class: 'lh-thumb' });
  if (project.thumbnail?.startsWith('data:image/')) box.append(h('img', { src: project.thumbnail, alt: '', loading: 'lazy' }));
  else box.append(icon(SVG.emptyThumb));
  return box;
};

const startInlineRename = (card: HTMLElement, nameEl: HTMLElement, project: ProjectSummary) => {
  const input = h('input', { type: 'text', class: 'lh-rename', value: project.name, ariaLabel: '새 이름' } as Partial<HTMLInputElement>);
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit: boolean) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (commit && name && name !== project.name) {
      input.disabled = true;
      const ok = await renameProject(project.id, name);
      if (ok) return; // 목록이 다시 그려진다
    }
    input.replaceWith(nameEl);
    card.focus();
  };
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') void finish(true);
    if (e.key === 'Escape') void finish(false);
  });
  input.addEventListener('blur', () => void finish(true));
};

const fileCard = (project: ProjectSummary) => {
  const nameEl = h('span', { class: 'lh-file-name', title: project.name }, project.name);
  const sceneText = project.scene_count ? `씬 ${project.scene_count}` : '';
  const meta = [venueLabel(project.venue_key), sceneText].filter(Boolean).join(' · ');

  const card = h('article', { class: 'lh-card lh-file', tabIndex: 0, ariaLabel: `${project.name} 열기` } as Partial<HTMLElement>);
  const open = async () => {
    if (card.classList.contains('lh-busy')) return;
    card.classList.add('lh-busy');
    await openProject(project.id);
    card.classList.remove('lh-busy');
  };

  const menu = popupMenu([
    ['열기', () => void open()],
    ['이름 바꾸기', () => startInlineRename(card, nameEl, project)],
    ['내 컴퓨터에 내려받기', () => void downloadProject(project.id)],
    ['삭제', () => {
      if (window.confirm(`"${project.name}" 작업을 온라인에서 지울까요? 되돌릴 수 없습니다.`)) void deleteProject(project.id);
    }, true],
  ]);
  const more = button('lh-iconbtn lh-more', icon(SVG.more), (e) => { e.stopPropagation(); togglePopup(more, menu); },
    { ariaLabel: '작업 메뉴', ariaHasPopup: 'true', ariaExpanded: 'false' } as Partial<HTMLButtonElement>);

  const cloudIcon = icon(SVG.cloud);
  cloudIcon.classList.add('lh-cloud');
  cloudIcon.title = '온라인에 저장됨';

  card.append(
    fileThumb(project),
    h('div', { class: 'lh-file-body' },
      nameEl,
      h('div', { class: 'lh-row' }, h('span', { class: 'lh-meta' }, `마지막 수정: ${formatUpdated(project.updated_at)}`), cloudIcon),
      h('div', { class: 'lh-row' }, h('span', { class: 'lh-meta' }, meta), h('div', { class: 'lh-popup-wrap' }, more, menu))),
    h('div', { class: 'lh-busy-label' }, '여는 중…'));

  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.lh-popup-wrap, input')) return;
    void open();
  });
  card.addEventListener('keydown', (e) => {
    if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void open(); }
  });
  return card;
};

const sortedProjects = () => {
  const list = [...(projects ?? [])];
  if (sortMode === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  else list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return list;
};

const renderFiles = () => {
  const user = getUser();
  sortButton.title = sortMode === 'recent' ? '정렬: 최근 수정순 (누르면 이름순)' : '정렬: 이름순 (누르면 최근 수정순)';
  sortButton.setAttribute('aria-label', sortButton.title);
  viewButton.replaceChildren(icon(viewMode === 'grid' ? SVG.list : SVG.grid));
  viewButton.title = viewMode === 'grid' ? '목록으로 보기' : '카드로 보기';
  viewButton.setAttribute('aria-label', viewButton.title);
  sortButton.hidden = viewButton.hidden = !user;

  if (!user) {
    filesHeading.textContent = '온라인 작업';
    filesSlot.replaceChildren(cloudConfig
      ? h('div', { class: 'lh-note' },
        h('p', {}, '로그인하면 작업을 온라인에 저장하고 어느 컴퓨터에서나 이어서 할 수 있습니다.'),
        (() => { const b = button('lh-google lh-google-small', null, () => void signInWithGoogle()); b.append(icon(SVG.google), 'Google로 로그인'); return b; })())
      : h('div', { class: 'lh-note' }, h('p', {}, '작업은 편집 화면의 ☰ 메뉴에서 "저장"을 눌러 내 컴퓨터에 JSON 파일로 저장합니다. 다시 열 때는 위의 "기기에서 열기"를 누릅니다.')));
    return;
  }

  filesHeading.textContent = '내 작업';
  if (listState === 'loading' && !projects) {
    filesSlot.replaceChildren(h('p', { class: 'lh-status' }, '불러오는 중…'));
    return;
  }
  if (listState === 'error') {
    filesSlot.replaceChildren(h('div', { class: 'lh-note' }, h('p', {}, NETWORK_MESSAGE), button('lh-outline lh-small', '다시 시도', () => void loadList())));
    return;
  }
  const list = sortedProjects();
  if (!list.length) {
    filesSlot.replaceChildren(h('p', { class: 'lh-status' }, '아직 온라인에 저장한 작업이 없습니다. 위의 새로 만들기로 시작해 보세요.'));
    return;
  }
  filesSlot.replaceChildren(h('div', { class: `lh-files lh-${viewMode}` }, ...list.map(fileCard)));
};

const loadList = async () => {
  if (!getUser()) { projects = null; return; }
  const token = ++listToken;
  listState = 'loading';
  renderFiles();
  try {
    const list = await listProjects();
    if (token !== listToken) return;
    projects = list;
    listState = 'idle';
  } catch (err) {
    if (token !== listToken) return;
    console.error('온라인 작업 목록을 불러오지 못했습니다', err);
    listState = 'error';
  }
  renderFiles();
};

/* ---------- 어떤 화면을 보일지 ---------- */

const currentScreen = (): 'pending' | 'login' | 'home' => {
  if (!isAuthResolved() && !gaveUpWaiting) return 'pending';
  if (getUser()) return 'home';
  if (cloudConfig && !hasSkippedLogin()) return 'login';
  return 'home';
};

const render = () => {
  closePopup();
  const screen = currentScreen();
  root.dataset.screen = screen;
  loginView.hidden = screen !== 'login';
  homeView.hidden = screen !== 'home';
  if (screen !== 'home') return;
  renderAccount(getUser());
  renderFiles();
};

export const initHome = () => {
  const screen = landing();
  if (!screen) return;
  loginView = buildLogin();
  homeView = buildHome();
  root = h('div', { class: 'lh' }, loginView, homeView);
  screen.append(root);
  screen.classList.add('lh-on');

  document.addEventListener('click', (e) => {
    if (openPopup && !(e.target as HTMLElement).closest('.lh-popup-wrap')) closePopup();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });

  let lastUserId: string | null | undefined;
  onAuthChange(user => {
    const changedUser = user?.id !== lastUserId;
    lastUserId = user?.id ?? null;
    if (changedUser) projects = null;
    render();
    if (user && changedUser && landingVisible()) void loadList();
  });
  onProjectsChange(() => { if (getUser()) void loadList(); });

  // 편집 화면에서 "홈으로"를 누르면 시작 화면이 다시 보인다: 그때마다 목록을 새로 받는다
  new MutationObserver(() => {
    if (!landingVisible()) return;
    render();
    if (getUser()) void loadList();
  }).observe(screen, { attributes: true, attributeFilter: ['style'] });

  window.setTimeout(() => {
    if (isAuthResolved()) return;
    gaveUpWaiting = true;
    render();
  }, 4000);

  render();
};
