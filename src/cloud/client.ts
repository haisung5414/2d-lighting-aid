// src/cloud/client.ts
// Supabase 클라이언트. 라이브러리는 설정이 있을 때 처음 필요해진 순간에만 불러온다 (로컬만 쓰는 사람은 받지 않는다)

import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudConfig } from './config';

let clientPromise: Promise<SupabaseClient> | null = null;

export const getClient = (): Promise<SupabaseClient> => {
  if (!cloudConfig) return Promise.reject(new Error('Supabase is not configured'));
  const { url, anonKey } = cloudConfig;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, anonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return clientPromise;
};
