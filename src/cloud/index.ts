// src/cloud/index.ts
// 온라인 저장 기능의 시작점. 설정이 없으면 로그인 버튼만 꺼 둔 채 Supabase 라이브러리를 불러오지 않는다
// 사양: docs/cloud/CLOUD_SPEC.md

import './cloud.css';
import { initAccountUI } from './account';
import { initAuth } from './auth';

export const initCloud = () => {
  initAccountUI();
  void initAuth();
};
