// src/config/fixtureAvailability.ts
// 극장마다 쓸 수 있는 조명 종류. 인문소극장에는 줌 엘립소이달이 없고, 두레문예관에는 고정 렌즈 엘립소이달과 PAR가 없다.
// 값은 venues.ts의 unavailableFixtures에 있고, 도구 레일(ui/tools.ts)과 조명 설정(ui/lightSettings.ts)이 함께 쓴다.

import { VENUES, type FixtureKind } from './venues';
import type { Fixture, StageConfig } from '../types';

/** 이 극장에 그 종류가 없으면 안내 문구, 있으면 null */
export const unavailableReason = (stage: Pick<StageConfig, 'venue_key'>, kind: FixtureKind): string | null => {
  const venue = stage.venue_key ? (VENUES as Record<string, { unavailableFixtures?: Partial<Record<FixtureKind, string>> }>)[stage.venue_key] : undefined;
  return venue?.unavailableFixtures?.[kind] ?? null;
};

export const fixtureKindOf = (fix: Fixture): FixtureKind =>
  fix.type === 'ellipsoidal' ? 'fixed' : fix.type;
