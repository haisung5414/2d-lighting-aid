// src/state/sceneVisibility.ts
// 씬마다 세트·사람 모형 숨기기. 세트와 사람 모형은 모든 씬이 함께 쓰고(위치·크기 공유),
// 씬은 "이 씬에서 숨긴 것" 목록만 가진다. 숨긴 것은 화면뿐 아니라 밝기·그림자 계산에서도 빠진다.
// 목록이 없거나 비어 있으면 모두 보인다 (예전 파일은 그대로 열린다).

import type { Actor, Cue, SetPiece, StageConfig } from '../types';

export const isSetShown = (cue: Cue | undefined, piece: SetPiece) => !cue?.hidden_set_ids?.includes(piece.id);

export const isActorShown = (cue: Cue | undefined, actor: Actor) => !cue?.hidden_actor_ids?.includes(actor.id);

/** 이 씬에 보이는 세트 (밝기 계산, 2D·3D 그리기, 고르기에 쓴다) */
export const visibleSetPieces = (cue: Cue | undefined, stage: StageConfig): SetPiece[] =>
  (stage.set_pieces ?? []).filter(piece => isSetShown(cue, piece));

export const visibleActors = (cue: Cue | undefined, actors: Actor[]): Actor[] =>
  actors.filter(actor => isActorShown(cue, actor));

/** 씬의 숨김 목록에서 id를 넣거나 뺀다 */
export const setHiddenIn = (cue: Cue, key: 'hidden_set_ids' | 'hidden_actor_ids', id: string, hidden: boolean) => {
  const list = new Set(cue[key] ?? []);
  if (hidden) list.add(id);
  else list.delete(id);
  if (list.size) cue[key] = [...list];
  else delete cue[key];
};
