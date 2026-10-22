// src/state/mergeWork.ts
// 씬 가져오기(이어 붙이기): 다른 작업 파일의 씬을 지금 작업 뒤에 붙인다. 화면은 ui/importScenes.ts가 맡는다.
//
// 세트와 사람 모형은 모든 씬이 함께 쓰므로 가져올 파일의 것을 모두 더하고, 씬마다 숨김 목록(state/sceneVisibility.ts)으로 나눈다.
//   - 기존 씬에서는 새로 가져온 세트·사람을 숨긴다.
//   - 가져온 씬에서는 원래 있던 세트·사람을 숨긴다.
//   - 위치·크기(·색)가 같은 세트, 위치·키가 같은 사람은 같은 것으로 보고 하나로 합친다 (양쪽 씬에 모두 보인다).
// 숨긴 것은 밝기·그림자 계산에서도 빠지므로, 가져온 뒤에도 각 씬의 계산량은 그 씬에 보이는 것만큼이다.
// 내부 id(씬·조명·세트·사람)는 모두 새로 발급하고, 이름이 겹치는 씬은 가져온 파일 이름을 앞에 붙인다.
// 채널 번호는 실제 배선과 맞아야 하므로 바꾸지 않고, 겹치는 번호만 알려 준다.

import { VENUES } from '../config/venues';
import { DEFAULT_LAMP } from '../engine/photometrics';
import type { Actor, AppState, Cue, SetPiece } from '../types';
import { ACTOR_FACE_OFFSET, DEFAULT_ACTOR_HEIGHT, DEFAULT_COSTUME_COLOR } from './store';

/** 온라인 저장 한도 (src/cloud/projects.ts의 MAX_BYTES와 같다) */
export const ONLINE_LIMIT_BYTES = 5_000_000;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).substring(2, 11)}`;
const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/** 작업의 공연장 키. 예전 파일은 참고 도면 레이어 이름으로 추정한다 */
const venueKeyOf = (data: Partial<AppState>): string => {
  const key = data.stage_config?.venue_key;
  if (key) return key;
  if (data.stage_config?.reference_layers?.some(layer => layer.id.startsWith('humanities'))) return 'humanities';
  return '';
};

const venueLabel = (key: string) => (VENUES as Record<string, { label: string } | undefined>)[key]?.label ?? '직접 정한 무대';

/** 빈 무대(공연장 모형이 없는 작업)는 크기까지 같아야 이어 붙일 수 있다 */
const needsSameSize = (key: string) => !key || key === 'sandbox' || !(key in VENUES);

export interface IncomingCue {
  id: string;
  label: string;
  thumbnail?: string;
  fixtures: number;
}

export interface ImportCheck {
  /** 이어 붙일 수 없으면 그 이유 */
  error: string | null;
  warnings: string[];
  cues: IncomingCue[];
}

/** 가져올 파일을 살펴본다: 형식, 공연장·무대 크기, 램프 규격 */
export const checkIncoming = (current: AppState, data: unknown): ImportCheck => {
  const incoming = data as Partial<AppState> | null;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.cues) || !incoming.stage_config) {
    return { error: '조명 작업 파일(JSON)이 아닙니다.', warnings: [], cues: [] };
  }
  const cues = incoming.cues
    .filter((cue): cue is Cue => Boolean(cue) && Array.isArray(cue.fixtures))
    .map(cue => ({ id: cue.cue_id, label: cue.label, thumbnail: cue.thumbnail, fixtures: cue.fixtures.length }));
  if (!cues.length) return { error: '가져올 씬이 없는 파일입니다.', warnings: [], cues };

  const here = venueKeyOf(current);
  const there = venueKeyOf(incoming);
  if (here !== there) {
    return { error: `이 파일은 "${venueLabel(there)}" 작업이라 "${venueLabel(here)}" 작업에 이어 붙일 수 없습니다.`, warnings: [], cues };
  }
  const a = current.stage_config;
  const b = incoming.stage_config;
  if (needsSameSize(here) && !(close(a.width, b.width, 0.001) && close(a.depth, b.depth, 0.001))) {
    return {
      error: `무대 크기가 달라 이어 붙일 수 없습니다. 지금 작업 ${a.width} × ${a.depth} m, 가져올 파일 ${b.width} × ${b.depth} m.`,
      warnings: [],
      cues
    };
  }

  const warnings: string[] = [];
  const lampHere = a.lamp ?? DEFAULT_LAMP;
  const lampThere = b.lamp ?? DEFAULT_LAMP;
  if (lampHere !== lampThere) {
    warnings.push('램프 규격이 지금 작업과 달라, 가져온 씬의 밝기는 지금 작업의 램프 규격으로 다시 계산됩니다.');
  }
  return { error: null, warnings, cues };
};

export interface ImportResult {
  addedCues: number;
  addedSets: number;
  /** 지금 작업에 같은 세트가 있어 하나로 합친 수 */
  mergedSets: number;
  addedActors: number;
  mergedActors: number;
  /** 다른 자리의 조명이 이미 쓰고 있는 채널 번호 */
  channelClashes: number[];
  /** 이어 붙인 뒤 작업 파일 크기 */
  bytes: number;
}

const sameSet = (a: SetPiece, b: SetPiece) =>
  close(a.x, b.x, 0.001) && close(a.y, b.y, 0.001) && close(a.width, b.width, 0.001) && close(a.depth, b.depth, 0.001)
  && close(a.height, b.height, 0.001) && close(a.rotation, b.rotation, 0.5) && a.color.toLowerCase() === b.color.toLowerCase();

const sameActor = (a: Actor, b: Actor) => close(a.x, b.x, 0.01) && close(a.y, b.y, 0.01) && close(a.height, b.height, 0.01);

/** 예전 파일(사람 모형 하나 = probe)이면 사람 모형 목록으로 바꿔 읽는다 */
const incomingActors = (incoming: Partial<AppState>): Actor[] => {
  if (Array.isArray(incoming.actors)) return incoming.actors;
  const probe = incoming.probe;
  if (!probe) return [];
  return [{
    id: newId('actor'), label: '배우1', x: probe.x, y: probe.y,
    height: (incoming.stage_config?.actor_height ?? DEFAULT_ACTOR_HEIGHT - ACTOR_FACE_OFFSET) + ACTOR_FACE_OFFSET,
    is_visible: probe.is_visible !== false, costume_color: probe.costume_color ?? DEFAULT_COSTUME_COLOR
  }];
};

/** 이름이 겹치면 가져온 파일 이름을 앞에 붙이고, 그래도 겹치면 번호를 붙인다 */
const uniqueLabel = (label: string, taken: Set<string>, sourceName: string) => {
  let next = taken.has(label) ? `${sourceName} · ${label}` : label;
  for (let n = 2; taken.has(next); n++) next = `${sourceName} · ${label} (${n})`;
  taken.add(next);
  return next;
};

/**
 * draft(지금 작업)에 incoming의 씬 cueIds를 이어 붙인다. checkIncoming을 통과한 파일만 넘긴다.
 * draft를 직접 고치므로, 미리 보기는 복사본에, 실제 가져오기는 setState 안에서 부른다
 */
export const mergeInto = (draft: AppState, data: unknown, sourceName: string, cueIds: string[]): ImportResult => {
  const incoming: Partial<AppState> = JSON.parse(JSON.stringify(data));
  const picked = new Set(cueIds);
  const cues = (incoming.cues ?? []).filter(cue => picked.has(cue.cue_id));
  const name = sourceName.replace(/\.json$/i, '').trim() || '가져온 작업';

  draft.stage_config.set_pieces ??= [];
  const existingSets = [...draft.stage_config.set_pieces];
  const existingActors = [...draft.actors];

  // 세트: 같은 세트는 기존 것에 합치고, 나머지는 새 id로 더한다
  const setIdMap = new Map<string, string>();
  const matchedSetIds = new Set<string>();
  const newSetIds: string[] = [];
  const setLabels = new Set(existingSets.map(piece => piece.label));
  (incoming.stage_config?.set_pieces ?? []).forEach(piece => {
    const match = existingSets.find(old => !matchedSetIds.has(old.id) && sameSet(old, piece));
    if (match) {
      setIdMap.set(piece.id, match.id);
      matchedSetIds.add(match.id);
      return;
    }
    const id = newId('set');
    setIdMap.set(piece.id, id);
    newSetIds.push(id);
    draft.stage_config.set_pieces!.push({ ...piece, id, label: uniqueLabel(piece.label, setLabels, name) });
  });

  // 사람 모형도 같은 방식. 예전 파일의 "모든 씬에서 숨김"은 가져온 씬의 숨김으로 옮긴다
  const actorIdMap = new Map<string, string>();
  const matchedActorIds = new Set<string>();
  const newActorIds: string[] = [];
  const hiddenEverywhere: string[] = [];
  const actorLabels = new Set(existingActors.map(actor => actor.label));
  incomingActors(incoming).forEach(actor => {
    const match = existingActors.find(old => !matchedActorIds.has(old.id) && sameActor(old, actor));
    const id = match ? match.id : newId('actor');
    actorIdMap.set(actor.id, id);
    if (actor.is_visible === false) hiddenEverywhere.push(id);
    if (match) { matchedActorIds.add(match.id); return; }
    newActorIds.push(id);
    draft.actors.push({ ...actor, id, is_visible: true, label: uniqueLabel(actor.label, actorLabels, name) });
  });

  // 기존 씬: 새로 가져온 세트·사람을 숨긴다
  draft.cues.forEach(cue => {
    if (newSetIds.length) cue.hidden_set_ids = [...new Set([...(cue.hidden_set_ids ?? []), ...newSetIds])];
    if (newActorIds.length) cue.hidden_actor_ids = [...new Set([...(cue.hidden_actor_ids ?? []), ...newActorIds])];
  });

  // 가져온 씬: 원래 있던 세트·사람(같은 것으로 합친 것은 빼고)을 숨긴다
  const onlyHereSets = existingSets.filter(piece => !matchedSetIds.has(piece.id)).map(piece => piece.id);
  const onlyHereActors = existingActors.filter(actor => !matchedActorIds.has(actor.id)).map(actor => actor.id);

  // 채널: 지금 작업에서 채널마다 쓰는 조명 자리
  const channelSpots = new Map<number, { x: number; y: number; z: number }[]>();
  draft.cues.forEach(cue => cue.fixtures.forEach(fix => {
    if (!fix.channel) return;
    const spots = channelSpots.get(fix.channel) ?? [];
    spots.push(fix.position);
    channelSpots.set(fix.channel, spots);
  }));
  const clashes = new Set<number>();

  const cueLabels = new Set(draft.cues.map(cue => cue.label));
  const firstNew = draft.cues.length;
  cues.forEach(source => {
    const cue: Cue = JSON.parse(JSON.stringify(source));
    cue.cue_id = newId('cue');
    cue.label = uniqueLabel(source.label, cueLabels, name);
    cue.fixtures.forEach(fix => {
      fix.id = newId('fixture');
      const spots = fix.channel ? channelSpots.get(fix.channel) : undefined;
      if (spots && !spots.some(p => close(p.x, fix.position.x, 0.05) && close(p.y, fix.position.y, 0.05) && close(p.z, fix.position.z, 0.05))) {
        clashes.add(fix.channel!);
      }
    });
    const hiddenSets = [...(source.hidden_set_ids ?? []).map(id => setIdMap.get(id)).filter((id): id is string => Boolean(id)), ...onlyHereSets];
    const hiddenActors = [
      ...(source.hidden_actor_ids ?? []).map(id => actorIdMap.get(id)).filter((id): id is string => Boolean(id)),
      ...hiddenEverywhere,
      ...onlyHereActors
    ];
    delete cue.hidden_set_ids;
    delete cue.hidden_actor_ids;
    if (hiddenSets.length) cue.hidden_set_ids = [...new Set(hiddenSets)];
    if (hiddenActors.length) cue.hidden_actor_ids = [...new Set(hiddenActors)];
    draft.cues.push(cue);
  });

  if (cues.length) {
    draft.active_cue_index = firstNew;
    draft.selected_fixture_id = null;
    draft.selected_set_id = null;
    draft.selected_actor_id = null;
  }

  return {
    addedCues: cues.length,
    addedSets: newSetIds.length,
    mergedSets: matchedSetIds.size,
    addedActors: newActorIds.length,
    mergedActors: matchedActorIds.size,
    channelClashes: [...clashes].sort((a, b) => a - b),
    bytes: new Blob([JSON.stringify(draft)]).size
  };
};

/** 가져오기 전에 결과를 미리 계산한다 (지금 작업은 바꾸지 않는다) */
export const previewMerge = (current: AppState, data: unknown, sourceName: string, cueIds: string[]): ImportResult =>
  mergeInto(JSON.parse(JSON.stringify(current)), data, sourceName, cueIds);

