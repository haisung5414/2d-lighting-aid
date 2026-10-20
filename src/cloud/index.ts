// src/cloud/index.ts
// 온라인 저장 기능과 시작 화면(로그인·홈)의 시작점. 설정이 없으면 홈은 내 컴퓨터 모드로만 보이고 Supabase 라이브러리를 불러오지 않는다
// 사양: docs/cloud/CLOUD_SPEC.md

import './cloud.css';
import { initAccountUI } from './account';
import { initAuth, onAuthChange } from './auth';
import { initFileMenu } from './fileMenu';
import { initHome } from './home';
import { detachOnSignOut, initProjectTracking } from './projects';

export const initCloud = () => {
  initProjectTracking();
  initAccountUI();
  initFileMenu();
  initHome();
  // 로그아웃하면 열려 있는 온라인 작업의 저장 위치를 내 컴퓨터로 바꾼다
  onAuthChange(user => { if (!user) detachOnSignOut(); });
  void initAuth();
};
