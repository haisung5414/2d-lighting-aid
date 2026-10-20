// src/cloud/config.ts
// 온라인 저장(Supabase) 설정. 공개용 주소와 anon(publishable) 키만 쓴다. 비밀 키는 절대 넣지 않는다.
// 둘 중 하나라도 없으면 온라인 기능을 모두 끈다 (docs/cloud/CLOUD_SPEC.md §2)

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const cloudConfig = url && anonKey ? { url, anonKey } : null;

/** 로그인하고 돌아올 주소: 배포 사이트면 https://<id>.github.io/2d-lighting-aid/ */
export const appUrl = () => location.origin + import.meta.env.BASE_URL;
