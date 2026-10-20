// src/cloud/auth.ts
// Google 로그인 상태. 로그인은 페이지를 떠났다 돌아오므로, 편집 중인 작업을 sessionStorage에 맡겨 두었다가 되살린다.
// 사양: docs/cloud/CLOUD_SPEC.md §4.3

import type { Session } from '@supabase/supabase-js';
import { getState } from '../state/store';
import { loadProjectData } from '../ui/manager';
import { getFileState } from '../ui/shell';
import { getClient } from './client';
import { appUrl, cloudConfig } from './config';

export interface CloudUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

const PENDING_WORK_KEY = 'lightingAid.cloud.pendingWork';

let currentUser: CloudUser | null = null;
/** 처음 로그인 상태 확인이 끝났는가 (설정이 없으면 처음부터 끝난 것으로 본다) */
let resolved = !cloudConfig;
const listeners: ((user: CloudUser | null) => void)[] = [];

export const getUser = () => currentUser;
export const isAuthResolved = () => resolved;

/** "로그인 없이 시작하기"를 고른 적이 있으면 로그인 화면 대신 홈을 보인다 (docs/cloud/CLOUD_SPEC.md §4.2) */
const SKIP_LOGIN_KEY = 'lightingAid.cloud.skipLogin';
export const hasSkippedLogin = () => { try { return localStorage.getItem(SKIP_LOGIN_KEY) === '1'; } catch { return false; } };
export const setSkippedLogin = (skip: boolean) => {
  try { if (skip) localStorage.setItem(SKIP_LOGIN_KEY, '1'); else localStorage.removeItem(SKIP_LOGIN_KEY); } catch { /* 저장소를 못 쓰면 이번만 */ }
};

/** 로그인 상태가 바뀔 때마다 부른다 (등록하자마자 지금 상태로 한 번 부른다) */
export const onAuthChange = (listener: (user: CloudUser | null) => void) => {
  listeners.push(listener);
  listener(currentUser);
};

const toUser = (session: Session | null): CloudUser | null => {
  const user = session?.user;
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const email = user.email ?? '';
  return {
    id: user.id,
    email,
    name: meta.full_name || meta.name || email.split('@')[0] || '내 계정',
    avatarUrl: meta.avatar_url || meta.picture || null,
  };
};

const setUser = (user: CloudUser | null, force = false) => {
  if (!force && user?.id === currentUser?.id) return;
  currentUser = user;
  listeners.forEach(listener => listener(user));
};

const isEditorOpen = () => document.getElementById('editor-screen')?.style.display === 'flex';

/** 로그인하러 떠나기 전에 지금 작업을 맡겨 둔다. 맡기지 못하면 false */
const stashWork = (): boolean => {
  if (!isEditorOpen()) return true;
  const { name, dirty } = getFileState();
  try {
    sessionStorage.setItem(PENDING_WORK_KEY, JSON.stringify({ name, dirty, state: getState() }));
    return true;
  } catch {
    return false;
  }
};

const takeStashedWork = () => {
  try {
    const raw = sessionStorage.getItem(PENDING_WORK_KEY);
    sessionStorage.removeItem(PENDING_WORK_KEY);
    return raw ? JSON.parse(raw) as { name: string | null; dirty: boolean; state: unknown } : null;
  } catch {
    return null;
  }
};

/** 로그인에서 돌아왔으면 맡겨 둔 작업을 되살린다 (로그인을 취소하고 돌아와도 되살린다) */
const restoreStashedWork = () => {
  const work = takeStashedWork();
  if (!work) return;
  try {
    loadProjectData(work.state, work.name);
    window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name: work.name, dirty: work.dirty } }));
  } catch (err) {
    console.error('로그인 전 작업을 되살리지 못했습니다', err);
  }
};

/** 로그인 실패로 돌아오면 주소에 error가 붙는다. 알려 주고 주소를 정리한다 */
const reportRedirectError = () => {
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const error = params.get('error_description') || params.get('error') || hash.get('error_description') || hash.get('error');
  if (!error) return;
  console.error('로그인 실패:', error);
  history.replaceState(null, '', location.pathname);
  // 사용자가 Google 화면에서 취소한 경우는 조용히 넘어간다
  if (!/access_denied/i.test(error)) alert('로그인하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.');
};

export const initAuth = async () => {
  if (!cloudConfig) return;
  try {
    const client = await getClient();
    // 주소에 ?code=가 있으면 getSession이 세션으로 바꾼 뒤에 돌아온다
    const { data, error } = await client.auth.getSession();
    if (error) console.error('로그인 상태를 확인하지 못했습니다', error);
    setUser(toUser(data.session));
    client.auth.onAuthStateChange((_event, session) => setUser(toUser(session)));
  } catch (err) {
    console.error('온라인 저장을 시작하지 못했습니다', err);
  }
  if (new URLSearchParams(location.search).has('code')) history.replaceState(null, '', location.pathname);
  reportRedirectError();
  restoreStashedWork();
  resolved = true;
  setUser(currentUser, true); // 확인이 끝났음을 알린다 (홈이 로그인 화면/홈 중 무엇을 보일지 정한다)
};

export const signInWithGoogle = async () => {
  if (!stashWork() && !window.confirm('지금 작업을 잠시 보관하지 못했습니다. 로그인하면 열려 있는 작업이 사라집니다. 계속할까요?')) return;
  try {
    const client = await getClient();
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) throw error;
  } catch (err) {
    takeStashedWork();
    console.error('로그인을 시작하지 못했습니다', err);
    alert('로그인을 시작하지 못했습니다. 인터넷 연결을 확인하거나 잠시 뒤에 다시 시도해 주세요.');
  }
};

/** 이 브라우저에서만 로그아웃한다. 열려 있는 작업은 화면에 그대로 둔다 */
export const signOut = async () => {
  try {
    const client = await getClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch (err) {
    console.error('로그아웃 중 오류', err);
  }
  setSkippedLogin(false);
  setUser(null);
};
