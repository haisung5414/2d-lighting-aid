// src/cloud/auth.ts
// Google 로그인 상태. 로그인은 페이지를 떠났다 돌아오며, 돌아오면 홈이 보인다 (열려 있던 작업은 되살리지 않는다).
// 사양: docs/cloud/CLOUD_SPEC.md §4.3

import type { Session } from '@supabase/supabase-js';
import { getClient } from './client';
import { appUrl, cloudConfig } from './config';

export interface CloudUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

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
  resolved = true;
  setUser(currentUser, true); // 확인이 끝났음을 알린다 (홈이 로그인 화면/홈 중 무엇을 보일지 정한다)
};

/** Google 로그인 화면으로 떠난다. 열려 있던 작업은 되살리지 않는다: 돌아오면 홈이 보인다 (저장 안 된 작업 경고는 account.ts가 먼저 띄운다) */
export const signInWithGoogle = async () => {
  try {
    const client = await getClient();
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
    if (error) throw error;
  } catch (err) {
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
