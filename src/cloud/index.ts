// src/cloud/index.ts
// 온라인 저장 기능과 시작 화면(로그인·홈)의 시작점. 설정이 없으면 홈은 내 컴퓨터 모드로만 보이고 Supabase 라이브러리를 불러오지 않는다
// 사양: docs/cloud/CLOUD_SPEC.md

import './cloud.css';
import { initAccountUI } from './account';
import { initAuth, onAuthChange } from './auth';
import { initFileMenu } from './fileMenu';
import { initHome } from './home';
import { detachOnSignOut, initAutosave, initProjectTracking } from './projects';
import { initShare } from './share';

export const initCloud = () => {
  initProjectTracking();
  initAutosave();
  initAccountUI();
  initFileMenu();
  initHome();
  // 공유 링크로 들어왔으면 로그인 상태를 확인하기 전에 홈을 붙잡아 둔다
  initShare();
  // 로그아웃하면 열려 있는 온라인 작업의 저장 위치를 내 컴퓨터로 바꾼다
  onAuthChange(user => { if (!user) detachOnSignOut(); });
  void initAuth();
};
